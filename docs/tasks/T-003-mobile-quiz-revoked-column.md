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
- [VERIFIED] `apps/web/src/lib/quiz.ts:209-211` and `apps/web/src/app/[locale]/quiz-play/[quizId]/page.tsx:26-28` select `"id, quiz_id, question, options, explanation, image_url, order_index"` without `correct_answer`; `apps/web/src/hooks/useQuizPlayerRuntime.ts:15-16,252-255` treats `correct_answer` as optional (`undefined` for DB quizzes, setting local `isCorrect = false`) and relies on server-authoritative grading via `finish_quiz_attempt` (`apps/web/src/lib/quiz.ts:297-332`). For web guests (`!attemptId || !userId`), `apps/web/src/hooks/useQuizAttempt.ts:192-268` saves locally to `sessionStorage` and returns `null`, and `apps/web/src/components/quiz-player/QuizPlayerResults.tsx:116-156` omits per-question `gradedAnswers` review and renders the `guestMode` / `guestNotice` banner (`packages/shared/src/messages/en/quizzes.json:17-18`).
- [VERIFIED] `apps/mobile/src/screens/QuizPlayScreen.tsx:159,172,189` and `apps/mobile/src/screens/QuizAttemptsScreen.tsx:238` still consume `question.correctAnswer` directly; `apps/mobile/src/lib/__tests__/quiz-service.test.ts:46,61,85` stubs `correct_answer` in mocks so tests stayed green despite the revoked grant.
- [INFERRED] Live Supabase PostgREST queries from the mobile app for `anon`/`authenticated` callers are expected to fail with a column permission error (`42501`) on `quiz_questions.correct_answer`; not executed against a live device in this session.

## Goal

Remove `correct_answer` from mobile `quiz_questions` queries and align mobile quiz playback, guest mode, and attempt review with `apps/web`'s exact server-authoritative grading (`finish_quiz_attempt`) and guest behavior.

## Non-goals

- Altering Postgres column grants in `supabase/migrations/20261108090003_quiz_column_grants.sql` or weakening answer-key protection.
- Inventing new mobile-only guest UX that diverges from `apps/web`.
- Deduplicating mobile quiz helpers into `packages/shared` (tracked in `T-012`).

## Steps

1. Update `apps/mobile/src/lib/quiz.ts:43-72` to select `"id, quiz_id, question, options, explanation, image_url, order_index"` (matching `apps/web/src/lib/quiz.ts:211`) and remove `correct_answer` from the row type and mapping.
2. Update `PlayerQuestion` in `apps/mobile/src/types/quiz.ts:31-37` (`correctAnswer?: number`) and update `apps/mobile/src/lib/quiz.ts:143-159` (`finishAttempt`) to return `answers` from `finish_quiz_attempt` (mirroring `apps/web/src/lib/quiz.ts:300-332`).
3. Update `apps/mobile/src/screens/QuizPlayScreen.tsx:154-222` so signed-in attempts pass `false` for `isCorrect` when `correctAnswer` is undefined and rely on `finishAttempt` for authoritative `score`, `totalQuestions`, and graded `answers`. For guest mode (`!user`), copy `apps/web`'s exact behavior (`apps/web/src/hooks/useQuizPlayerRuntime.ts:249-255`, `apps/web/src/hooks/useQuizAttempt.ts:192-268`, `apps/web/src/components/quiz-player/QuizPlayerResults.tsx:116-156` — local save with `isCorrect = false` when `correctAnswer` is undefined and `guestMode`/`guestNotice` banner without per-question answer-key review; do NOT invent new UX, and stop to ask the owner if any mobile screen lacks a web equivalent).
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

- None (owner confirmed mobile guest mode must mirror `apps/web` verbatim; stop and ask only if an unmapped screen edge case arises).
