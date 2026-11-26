---
id: T-011a
title: "Split useAiChat.ts hook incrementally (behavior-preserving)"
priority: P1
status: done
depends_on: []
touches:
  - "apps/web/src/hooks/useAiChat.ts"
  - "apps/web/src/hooks/ai-chat/**"
  - "apps/web/src/hooks/__tests__/useAiChat.test.tsx"
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

1. **First step (coverage gate):** Audit `apps/web/src/hooks/__tests__/useAiChat.test.tsx` against every branch of `sendMessage` — truncation, abort/race, conversation lazy-creation, error fallback, and Puter vs server routing — and add missing `sendMessage` unit assertions before extracting any code. **Outcome:** the audit (2026-11-26) found every named branch already covered (truncation `:1025/:1043`, races `:424/:851/:967/:820`, lazy creation `:602/:642/:669`, error fallback `:382/:409`; Puter-vs-server routing lives behind the mocked `aiAssistant` boundary), so no assertion was added — the finishing constraint for this card is that the existing tests stay green UNMODIFIED.
2. Extract cohesive modules under `apps/web/src/hooks/ai-chat/` (e.g., guest storage persistence helper, streaming/send orchestration helper, conversation restore/pagination helper) keeping `useAiChat.ts` as a thin orchestrator.
3. Preserve the exact return shape (`apps/web/src/hooks/useAiChat.ts:771-798`) and all existing `useAiChat.test.tsx` invariants (zero spurious `localStorage` writes on mount/mode-switch).
4. Run `pnpm --filter web test`, `pnpm --filter web lint`, and `pnpm --filter web typecheck`.

## Acceptance criteria

- [x] `pnpm --filter web test` — exits 0 with all `useAiChat.test.tsx` tests (including verified `sendMessage` branch coverage) passing
  evidence: `pnpm --filter web test` → `Test Files 113 passed (113)` / `Tests 1287 passed (1287)`, exit 0; targeted `pnpm --filter web exec vitest run src/hooks/__tests__/useAiChat.test.tsx` → `Tests 37 passed (37)`, exit 0; the two initial failures (missing user-row insert chain on reuse/in-flight ensure paths) were extraction bugs fixed in send-message.ts — no `__tests__` file was edited (git diff touches no test path)
- [x] `wc -l apps/web/src/hooks/useAiChat.ts` — reduced below 300 lines with extracted modules under `apps/web/src/hooks/ai-chat/`
  evidence: `wc -l apps/web/src/hooks/useAiChat.ts` → 298; extracted modules (wc -l): ai-chat/types.ts 25, ai-chat/guest-storage.ts 64, ai-chat/conversations.ts 172, ai-chat/transcript-sync.ts 205, ai-chat/stream-sink.ts 66, ai-chat/send-message.ts 356, ai-chat/puter-status.ts 26
- [x] `pnpm --filter web lint && pnpm --filter web typecheck` — exits 0
  evidence: `pnpm --filter web lint` → `✖ 36 problems (0 errors, 36 warnings)`, exit 0 (pristine-baseline run before the change: 36 warnings, 0 errors — no new warnings); `pnpm --filter web typecheck` → exit 0

## Evidence

- Gates run in `../masarx-wt/task-T-011a` after `pnpm install`; pristine baseline recorded before applying any change (typecheck exit 0, lint 0 errors/36 warnings, useAiChat suite 37/37).
- 799-line `useAiChat.ts` → 298-line orchestrator + 7 modules under `apps/web/src/hooks/ai-chat/`. The `@/lib/supabase` import stays only in the allowlisted `useAiChat.ts`; every extracted module receives the browser client as a `SupabaseClient` parameter (T-011c pattern).
- `sendMessage` branch coverage audited read-only per the no-test-edit constraint — see the note on Step 1.

## Rollback

Revert `apps/web/src/hooks/useAiChat.ts` and move `apps/web/src/hooks/ai-chat/` to `.trash/` per I9.

## Open questions

- None
