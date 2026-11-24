---
id: T-011
title: "Plan incremental split of web god files via sub-cards T-011a/b/c"
priority: P1
status: todo
depends_on:
  - T-010
touches:
  - "docs/tasks/T-011a-split-use-ai-chat.md"
  - "docs/tasks/T-011b-split-profile-page.md"
  - "docs/tasks/T-011c-split-course-detail-page.md"
owner_action: false
area: web
estimate: 0.5d
---

## Context

- [VERIFIED] The three target god files in `apps/web/src` are:
  1. `apps/web/src/hooks/useAiChat.ts` — **799 lines** (`#2` largest file in `apps/web/src`; already has `apps/web/src/hooks/__tests__/useAiChat.test.tsx`; handles localStorage persistence, Supabase row inserts at `:56-76`, conversation creation, streaming delta throttling, and Puter/server fallback).
  2. `apps/web/src/app/[locale]/profile/page.tsx` — **820 lines** (`#1` largest file in `apps/web/src`; currently 0 unit tests, covered by `T-010`; mixes profile editing, JWT role refresh at `:58-80`, academic metadata form, notifications, and desktop update check).
  3. `apps/web/src/app/[locale]/courses/[courseId]/page.tsx` — **541 lines** (`#7` largest file in `apps/web/src`; currently 0 unit tests, covered by `T-010`; mixes course fetching, enrollment state, review handling, and content tabs).
- [VERIFIED] Task board rules (`docs/tasks/README.md:17`) enforce one card = one branch = one PR, and cards larger than ~1 day must be split before execution.
- [INFERRED] Splitting all three god files in a single PR would exceed 1 day and create high merge-conflict risk across `hooks/`, `profile/`, and `courses/`.

## Goal

Break the god-file decomposition into three independently claimable, single-PR sub-cards (`T-011a`, `T-011b`, `T-011c`), each backed by unit tests from `T-010` and `pnpm tasks:lint` validation.

## Non-goals

- Do NOT modify `useAiChat.ts`, `profile/page.tsx`, or `courses/[courseId]/page.tsx` inside this planning card.
- Do NOT split other large files (`subjects/[subject]/page.tsx`, `ChatMessageItem.tsx`) unless scoped as separate follow-up cards.

## Steps

1. Inspect `apps/web/src/hooks/useAiChat.ts` (799L), `apps/web/src/app/[locale]/profile/page.tsx` (820L), and `apps/web/src/app/[locale]/courses/[courseId]/page.tsx` (541L) to map exact extraction boundaries (sub-hooks, presentational sections, Supabase query helpers).
2. Author `docs/tasks/T-011a-split-use-ai-chat.md` (`depends_on: [T-011]`, `touches: ["apps/web/src/hooks/useAiChat.ts", "apps/web/src/hooks/ai-chat/**", "apps/web/src/hooks/__tests__/useAiChat*"]`).
3. Author `docs/tasks/T-011b-split-profile-page.md` (`depends_on: [T-011]`, `touches: ["apps/web/src/app/[locale]/profile/**", "apps/web/src/components/profile/**"]`).
4. Author `docs/tasks/T-011c-split-course-detail-page.md` (`depends_on: [T-011]`, `touches: ["apps/web/src/app/[locale]/courses/[courseId]/**", "apps/web/src/components/courses/**"]`).
5. Validate schema, `depends_on`, and non-overlapping `touches` via `pnpm tasks:lint` and `pnpm tasks:test`.

## Acceptance criteria

- [ ] `ls docs/tasks/T-011a-*.md docs/tasks/T-011b-*.md docs/tasks/T-011c-*.md` — all 3 sub-cards exist
- [ ] `pnpm tasks:lint` — exits 0 with zero schema, dependency, or section errors
- [ ] `pnpm tasks:test` — exits 0

## Evidence

## Rollback

Move `docs/tasks/T-011a-*.md`, `T-011b-*.md`, and `T-011c-*.md` to `.trash/` per I9.

## Open questions

- Should `T-011b` and `T-011c` also remove direct `@/lib/supabase` imports from `profile/page.tsx:25` and `courses/[courseId]/page.tsx:8` to shrink the `T-009` ESLint ratchet list?
