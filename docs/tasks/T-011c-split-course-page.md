---
id: T-011c
title: "Split courses/[courseId]/page.tsx incrementally (behavior-preserving)"
priority: P1
status: done
depends_on:
  - T-010
touches:
  - "apps/web/src/app/[locale]/courses/[courseId]/page.tsx"
  - "apps/web/src/app/[locale]/courses/[courseId]/_hooks/**"
  - "apps/web/src/components/courses/**"
owner_action: false
area: web
estimate: 0.5d
---

## Context

- [VERIFIED] `apps/web/src/app/[locale]/courses/[courseId]/page.tsx` is **541 lines** (`#7` largest non-test file in `apps/web/src`), currently with **0** unit tests (covered by `T-010`).
- [VERIFIED] `apps/web/src/app/[locale]/courses/[courseId]/page.tsx:8` imports `supabase` from `@/lib/supabase`; `:23-26` already imports `CourseHero`, `CourseContent`, and `ReviewSection` from `@/components/courses/`, while data fetching, enrollment state, review submission, and modal/tab state remain inline in `page.tsx`.
- [INFERRED] Splitting `courses/[courseId]/page.tsx` before `T-010` characterization tests exist risks breaking enrollment status and review flows.

## Goal

Decompose `apps/web/src/app/[locale]/courses/[courseId]/page.tsx` into a dedicated course-detail data hook and focused sub-components under `apps/web/src/components/courses/` in one behavior-preserving PR backed by `T-010` tests.

## Non-goals

- Do NOT remove the `@/lib/supabase` browser import (keep `courses/[courseId]/page.tsx` in the `T-009` allowlist; Supabase migration is a separate burn-down card).
- Do NOT alter `useAiChat.ts` (`T-011a`) or `profile/page.tsx` (`T-011b`).

## Steps

1. Confirm `T-010` unit tests for `apps/web/src/app/[locale]/courses/[courseId]/page.tsx` are present and passing (`pnpm --filter web test`).
2. Extract inline course/enrollment/review state and handlers into a dedicated hook (`useCourseDetail` under `apps/web/src/app/[locale]/courses/[courseId]/_hooks/` or `apps/web/src/components/courses/`) and move inline enrollment/payment UI blocks into `apps/web/src/components/courses/`.
3. Keep `apps/web/src/app/[locale]/courses/[courseId]/page.tsx` as a thin view (< 250 lines) with identical behavior.
4. Run `pnpm --filter web test`, `pnpm --filter web lint`, and `pnpm --filter web typecheck`.

## Acceptance criteria

- [x] `wc -l apps/web/src/app/[locale]/courses/[courseId]/page.tsx` — reduced below 250 lines
evidence: `wc -l apps/web/src/app/[locale]/courses/[courseId]/page.tsx` → `219 apps/web/src/app/[locale]/courses/[courseId]/page.tsx` (540 before the split)
- [x] `pnpm --filter web test && pnpm --filter web lint && pnpm --filter web typecheck` — exits 0
evidence: `pnpm --filter web test` → `Test Files  113 passed (113)` / `Tests  1287 passed (1287)` incl. the unmodified T-010 suite `src/app/[locale]/courses/[courseId]/__tests__/page.test.tsx` (11 passed); `pnpm --filter web lint` → `✖ 36 problems (0 errors, 36 warnings)` (budget 52); `pnpm --filter web typecheck` → clean, all three exit 0

## Evidence

- `wc -l apps/web/src/app/[locale]/courses/[courseId]/page.tsx` → `219 apps/web/src/app/[locale]/courses/[courseId]/page.tsx` (540 before the split)
- `pnpm --filter web test` → `Test Files  113 passed (113)`, `Tests  1287 passed (1287)`, exit 0 — the T-010 characterization suite `__tests__/page.test.tsx` passes unmodified (11 tests)
- `pnpm --filter web lint` (`eslint . --max-warnings=52`) → `✖ 36 problems (0 errors, 36 warnings)`, exit 0
- `pnpm --filter web typecheck` (`tsc -p tsconfig.json --noEmit`) → no errors, exit 0

## Rollback

Revert `apps/web/src/app/[locale]/courses/[courseId]/page.tsx` and move newly extracted files to `.trash/` per I9.

## Open questions

- None
