---
id: T-003
title: "Stop selecting revoked correct_answer in mobile quiz"
priority: P0
status: todo
depends_on: []
touches:
  - "apps/mobile/src/lib/quiz.ts"
  - "apps/mobile/src/types/quiz.ts"
  - "apps/mobile/src/screens/QuizPlayScreen.tsx"
  - "apps/mobile/src/screens/QuizAttemptsScreen.tsx"
  - "apps/mobile/src/lib/__tests__/quiz-service.test.ts"
owner_action: false
area: mobile
estimate: 0.5d
---

## Context

- [VERIFIED] `supabase/migrations/20261108090003_quiz_column_grants.sql:8-10` revokes `SELECT` on `public.quiz_questions` from `anon, authenticated` and grants `SELECT (id, quiz_id, question, options, explanation, order_index, image_url)`, excluding `correct_answer`.
- [VERIFIED] `apps/mobile/src/lib/quiz.ts:45` selects `"id, quiz_id, question, options, correct_answer, explanation, image_url, order_index"`, and lines `55,69` map `row.correct_answer` onto `PlayerQuestion.correctAnswer` (`apps/mobile/src/types/quiz.ts:35`).
- [VERIFIED] `apps/web/src/lib/quiz.ts:209-211` and `apps/web/src/app/[locale]/quiz-play/[quizId]/page.tsx:26-28` select `"id, quiz_id, question, options, explanation, image_url, order_index"` without `correct_answer`; `apps/web/src/hooks/useQuizPlayerRuntime.ts:15-16,252-255` treats `correct_answer` as optional and relies on server-authoritative grading via `finish_quiz_attempt` (`apps/web/src/lib/quiz.ts:297-332`).
- [VERIFIED] `apps/mobile/src/screens/QuizPlayScreen.tsx:159,172,189` and `apps/mobile/src/screens/QuizAttemptsScreen.tsx:238` still consume `question.correctAnswer` directly; `apps/mobile/src/lib/__tests__/quiz-service.test.ts:46,61,85` stubs `correct_answer` in mocks so tests stayed green despite the revoked grant.
- [INFERRED] Live Supabase PostgREST queries from the mobile app for `anon`/`authenticated` callers are expected to fail with a column permission error (`42501`) on `quiz_questions.correct_answer`; not executed against a live device in this session.

## Goal

Remove `correct_answer` from mobile `quiz_questions` queries and align mobile quiz playback and attempt review with server-authoritative grading (`finish_quiz_attempt`), matching `apps/web`.

## Non-goals

- Altering Postgres column grants in `supabase/migrations/20261108090003_quiz_column_grants.sql` or weakening answer-key protection.
- Deduplicating mobile quiz helpers into `packages/shared` (tracked in `T-012`).

## Steps

1. Update `apps/mobile/src/lib/quiz.ts:43-72` to select `"id, quiz_id, question, options, explanation, image_url, order_index"` (matching `apps/web/src/lib/quiz.ts:211`) and remove `correct_answer` from the row type and mapping.
2. Update `PlayerQuestion` in `apps/mobile/src/types/quiz.ts:31-37` (`correctAnswer?: number`) and update `apps/mobile/src/lib/quiz.ts:143-159` (`finishAttempt`) to return `answers` from `finish_quiz_attempt` (mirroring `apps/web/src/lib/quiz.ts:300-332`).
3. Update `apps/mobile/src/screens/QuizPlayScreen.tsx:154-222` so signed-in attempts pass placeholder `isCorrect: false` to `saveAnswer` and rely on `finishAttempt` for authoritative `score`, `totalQuestions`, and graded `answers`; handle guest mode honestly (e.g., show recorded completion without claiming authoritative grading or require sign-in for graded attempts, matching `apps/web/src/hooks/useQuizPlayerRuntime.ts:249-255`).
4. Update `apps/mobile/src/screens/QuizAttemptsScreen.tsx:236-254` to render review correctness from `answer.is_correct` (from `quiz_attempts.answers` / `quiz_answers`) rather than `question.correctAnswer`.
5. Update `apps/mobile/src/lib/__tests__/quiz-service.test.ts:43-91` to remove `correct_answer` from `quiz_questions` mock payloads and assert the `.select(...)` column list excludes `correct_answer`.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [ ] `rg -n "correct_answer" apps/mobile/src/` returns zero matches in runtime queries/types.
- [ ] `pnpm --filter mobile test` exits 0 with `quiz-service.test.ts` asserting `correct_answer` is excluded from `.select(...)`.
- [ ] `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile export` exits 0.

## Evidence

## Rollback

Revert the mobile quiz commit via `git revert <commit>` (safe, client-only change; no DB migration involved).

## Open questions

- Decide whether guest mode in `apps/mobile/src/screens/QuizPlayScreen.tsx:200-214` should display answers-recorded summary without a graded score or be restricted to signed-in users when `correct_answer` is absent.
