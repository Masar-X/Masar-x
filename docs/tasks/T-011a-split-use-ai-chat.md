---
id: T-011a
title: "Split useAiChat.ts hook incrementally (behavior-preserving)"
priority: P1
status: todo
depends_on: []
touches:
  - "apps/web/src/hooks/useAiChat.ts"
  - "apps/web/src/hooks/ai-chat/**"
  - "apps/web/src/hooks/__tests__/useAiChat*"
owner_action: false
area: web
estimate: 0.5d
---

## Context

- [VERIFIED] `apps/web/src/hooks/useAiChat.ts` is **799 lines** (`#2` largest file in `apps/web/src`), mixing chat row helpers (`:41-80`), localStorage persistence (`:239-388`), `sendMessage` streaming/orchestration (`:403-770`), conversation pagination (`loadOlder`), and public hook return surface (`:771-798`).
- [VERIFIED] `apps/web/src/hooks/__tests__/useAiChat.test.tsx` (1,052 lines) already exists and covers guest restore (`:127-166`), event-driven guest persistence including `sendMessage` (`:167-279`), `clearChat` (`:280-326`), streaming (`:327-470`), `student_agent` gating (`:471-489`), and `loadOlder` (`:490+`) — so `T-011a` does not depend on `T-010`.
- [VERIFIED] `apps/web/src/hooks/useAiChat.ts:6` imports `supabase` from `@/lib/supabase`.

## Goal

Extract cohesive sub-modules/hooks (persistence, streaming state/delta handling, conversation paging/restore) out of `apps/web/src/hooks/useAiChat.ts` in one behavior-preserving PR while preserving the exact public hook API.

## Non-goals

- Do NOT remove or migrate the `@/lib/supabase` import in `useAiChat.ts:6` (keep behavior-preserving; Supabase import burn-down belongs to a separate card under `T-009`).
- Do NOT change `profile/page.tsx` (`T-011b`) or `courses/[courseId]/page.tsx` (`T-011c`).

## Steps

1. **First step (coverage gate):** Audit `apps/web/src/hooks/__tests__/useAiChat.test.tsx` against every branch of `sendMessage` (`apps/web/src/hooks/useAiChat.ts:403-770`) — truncation, abort/race, conversation lazy-creation, error fallback, and Puter vs server routing — and add missing `sendMessage` unit assertions before extracting any code.
2. Extract cohesive modules under `apps/web/src/hooks/ai-chat/` (e.g., guest storage persistence helper, streaming/send orchestration helper, conversation restore/pagination helper) keeping `useAiChat.ts` as a thin orchestrator.
3. Preserve the exact return shape (`apps/web/src/hooks/useAiChat.ts:771-798`) and all existing `useAiChat.test.tsx` invariants (zero spurious `localStorage` writes on mount/mode-switch).
4. Run `pnpm --filter web test`, `pnpm --filter web lint`, and `pnpm --filter web typecheck`.

## Acceptance criteria

- [ ] `pnpm --filter web test` — exits 0 with all `useAiChat.test.tsx` tests (including verified `sendMessage` branch coverage) passing
- [ ] `wc -l apps/web/src/hooks/useAiChat.ts` — reduced below 300 lines with extracted modules under `apps/web/src/hooks/ai-chat/`
- [ ] `pnpm --filter web lint && pnpm --filter web typecheck` — exits 0

## Evidence

## Rollback

Revert `apps/web/src/hooks/useAiChat.ts` and move `apps/web/src/hooks/ai-chat/` to `.trash/` per I9.

## Open questions

- None
