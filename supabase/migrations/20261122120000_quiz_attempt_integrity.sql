-- Issue #278 (bug-audit wave-04 H26): attempt-start check-then-insert race.
-- Two rapid attempt-starts (double-click / two tabs) could double-insert an
-- ACTIVE quiz_attempts row; resume then picked one arbitrarily. Fixes, in order:
--   1. Close duplicate ACTIVE attempts created by the historic race
--      (the oldest per (user_id, quiz_id) is kept; the rest are marked
--      finished so no history rows are lost).
--   2. UNIQUE partial index on (user_id, quiz_id) WHERE finished_at IS NULL —
--      the DB-level backstop.
--   3. start_quiz_attempt() — the client's single atomic entry point
--      (insert-or-return), with a unique-violation fallback that adopts the
--      winner's attempt (server-side idempotency; spec-030 RPC conventions).

-- 1) Close duplicate active attempts (keep the oldest per (user_id, quiz_id)).
-- The spec-030 grading guard (trg_guard_quiz_attempt_score) blocks
-- grading-field UPDATEs unless the session opts in — the same transaction-
-- scoped escape hatch finish_quiz_attempt uses (baseline set_config call).
SELECT set_config('app.quiz_grading', 'on', true);

UPDATE public.quiz_attempts qa
   SET finished_at = now()
  WHERE qa.finished_at IS NULL
    AND qa.user_id IS NOT NULL
    AND qa.quiz_id IS NOT NULL
    AND qa.id NOT IN (
      SELECT DISTINCT ON (qa2.user_id, qa2.quiz_id) qa2.id
        FROM public.quiz_attempts qa2
       WHERE qa2.finished_at IS NULL
         AND qa2.user_id IS NOT NULL
         AND qa2.quiz_id IS NOT NULL
       ORDER BY qa2.user_id, qa2.quiz_id, qa2.created_at ASC NULLS FIRST, qa2.id ASC
    );

-- 2) Unique partial index: one ACTIVE attempt per (user, quiz).
CREATE UNIQUE INDEX IF NOT EXISTS quiz_attempts_active_unique
    ON public.quiz_attempts (user_id, quiz_id)
    WHERE finished_at IS NULL;

-- 3) Atomic start-or-resume. SECURITY DEFINER + locked search_path mirrors
-- finish_quiz_attempt (20261031000000_baseline); ownership comes from
-- auth.uid() inside the function, never from caller-supplied columns.
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(p_quiz_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_attempt public.quiz_attempts%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'start_quiz_attempt requires an authenticated caller'
      USING ERRCODE = '42501';
  END IF;
  IF p_quiz_id IS NULL THEN
    RAISE EXCEPTION 'start_quiz_attempt: p_quiz_id is required'
      USING ERRCODE = '22004';
  END IF;

  SELECT * INTO v_attempt
    FROM public.quiz_attempts
   WHERE user_id = v_user_id
     AND quiz_id = p_quiz_id
     AND finished_at IS NULL
   ORDER BY created_at ASC NULLS FIRST, id ASC
   LIMIT 1;

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.quiz_attempts (quiz_id, user_id, score, total_questions, started_at)
      VALUES (p_quiz_id, v_user_id, 0, 0, now())
      RETURNING * INTO v_attempt;
    EXCEPTION WHEN unique_violation THEN
      -- A concurrent start won the race: adopt its attempt.
      SELECT * INTO v_attempt
        FROM public.quiz_attempts
       WHERE user_id = v_user_id
         AND quiz_id = p_quiz_id
         AND finished_at IS NULL
       ORDER BY created_at ASC NULLS FIRST, id ASC
       LIMIT 1;
      IF NOT FOUND THEN
        RAISE;
      END IF;
    END;
  END IF;

  RETURN to_jsonb(v_attempt);
END;
$function$;

REVOKE ALL ON FUNCTION public.start_quiz_attempt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_quiz_attempt(uuid) TO authenticated;
