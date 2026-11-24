---
id: T-011b
title: "Split profile/page.tsx incrementally (behavior-preserving)"
priority: P1
status: todo
depends_on:
  - T-010
touches:
  - "apps/web/src/app/[locale]/profile/page.tsx"
  - "apps/web/src/components/profile/**"
owner_action: false
area: web
estimate: 0.5d
---

## Context

- [VERIFIED] `apps/web/src/app/[locale]/profile/page.tsx` is **820 lines** (`#1` largest non-test file in `apps/web/src`), currently with **0** unit tests (covered by `T-010`).
- [VERIFIED] `apps/web/src/app/[locale]/profile/page.tsx:25` imports `supabase` from `@/lib/supabase`, and mixes display-name updates (`:45-54`), JWT admin-role refresh (`:58-80`), academic metadata editing, notifications, and desktop update check UI (`:22`) in one client page component.
- [INFERRED] Splitting `profile/page.tsx` before characterization tests exist in `T-010` risks silent regressions in auth/profile/role-refresh behavior.

## Goal

Decompose `apps/web/src/app/[locale]/profile/page.tsx` into focused sub-components/hooks under `apps/web/src/components/profile/` (or `profile/_components/`) in one behavior-preserving PR backed by `T-010` tests.

## Non-goals

- Do NOT remove the `@/lib/supabase` browser import (keep `profile/page.tsx` in the `T-009` allowlist; Supabase migration is a separate burn-down card).
- Do NOT alter `useAiChat.ts` (`T-011a`) or `courses/[courseId]/page.tsx` (`T-011c`).

## Steps

1. Confirm `T-010` unit tests for `apps/web/src/app/[locale]/profile/page.tsx` are present and passing (`pnpm --filter web test`).
2. Extract cohesive sections (e.g., profile info/name form, academic path card, admin role refresh control, notifications/desktop update section) into `apps/web/src/components/profile/` (or `apps/web/src/app/[locale]/profile/_components/`).
3. Keep `apps/web/src/app/[locale]/profile/page.tsx` as a thin shell (< 300 lines) with identical UI/RTL behavior and props.
4. Run `pnpm --filter web test`, `pnpm --filter web lint`, and `pnpm --filter web typecheck`.

## Acceptance criteria

- [ ] `wc -l apps/web/src/app/[locale]/profile/page.tsx` — reduced below 300 lines
- [ ] `pnpm --filter web test && pnpm --filter web lint && pnpm --filter web typecheck` — exits 0

## Evidence

## Rollback

Revert `apps/web/src/app/[locale]/profile/page.tsx` and move newly extracted files under `apps/web/src/components/profile/` to `.trash/` per I9.

## Open questions

- None
