/**
 * Shared quiz-attempt lifecycle helpers (T-012).
 *
 * `start_quiz_attempt` (supabase/migrations/20261122120000) is the single
 * atomic entry point for starting or resuming a signed-in user's attempt
 * (#278 H26): it returns the caller's ACTIVE attempt or inserts one, and
 * a concurrent start losing the unique-index race adopts the winner's row
 * (no check-then-insert window). Ownership comes from auth.uid() inside
 * the RPC — never a caller-supplied user id. Web and mobile previously
 * duplicated this call (web) or a racy client-side select-then-insert
 * (mobile); web now goes through this wrapper, and mobile keeps its
 * select-then-insert call pending the follow-up switch (its tests pin
 * that wire shape).
 */
import type { SupabaseClient } from "../supabase";

/**
 * quiz_attempts row shape returned by the RPC (jsonb of the row, so the
 * columns mirror the table: answers/created_at/updated_at included).
 * Consumers cast to their local row types via the generic parameter.
 */
export interface QuizAttemptRecord {
  id: string;
  quiz_id: string | null;
  user_id: string | null;
  score: number;
  total_questions: number;
  started_at: string | null;
  finished_at: string | null;
  time_taken_seconds: number | null;
  answers: unknown;
  created_at: string | null;
  updated_at: string | null;
}

export async function startOrResumeQuizAttempt<T = QuizAttemptRecord>(
  supabase: SupabaseClient,
  quizId: string,
): Promise<T> {
  const { data, error } = await supabase.rpc("start_quiz_attempt", {
    p_quiz_id: quizId,
  });
  if (error) throw error;
  return data as T;
}
