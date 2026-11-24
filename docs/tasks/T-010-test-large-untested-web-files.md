---
id: T-010
title: "Add unit tests for top untested web source files"
priority: P1
status: todo
depends_on: []
touches:
  - "apps/web/src/app/**/__tests__/**"
  - "apps/web/src/components/**/__tests__/**"
owner_action: false
area: web
estimate: 1d
---

## Context

- [VERIFIED] Line-count audit of all 390 non-test `.ts`/`.tsx` files in `apps/web/src` (resolved-import check against `apps/web/src/**/__tests__/**/*.test.{ts,tsx}`) confirms **13 of the top 20 largest files have no unit tests**:
  - Tested (7/20): `hooks/useAiChat.ts` (799L), `components/ai/ChatMessageItem.tsx` (767L), `lib/ai/assistant.ts` (716L), `components/ai/ChatInput.tsx` (559L), `lib/puter.ts` (426L), `app/[locale]/login/page.tsx` (425L via `login/__tests__/page.test.tsx`), `contexts/AuthContext.tsx` (407L).
  - Untested (13/20):
    1. `apps/web/src/app/[locale]/profile/page.tsx` (820L)
    2. `apps/web/src/app/[locale]/subjects/[subject]/page.tsx` (549L)
    3. `apps/web/src/app/[locale]/courses/[courseId]/page.tsx` (541L)
    4. `apps/web/src/app/[locale]/news/_components/NewsClient.tsx` (517L)
    5. `apps/web/src/app/[locale]/edit-summary/page.tsx` (510L)
    6. `apps/web/src/app/[locale]/quiz-attempts/page.tsx` (464L)
    7. `apps/web/src/app/[locale]/admin-dashboard/AdminAnalyticsPage.tsx` (453L)
    8. `apps/web/src/components/sidenav/AppNav.tsx` (439L)
    9. `apps/web/src/components/admin-shell/AdminOverviewTab.tsx` (437L)
    10. `apps/web/src/app/[locale]/ai-assistant/page.tsx` (424L)
    11. `apps/web/src/components/admin-shell/Sidebar.tsx` (415L)
    12. `apps/web/src/app/[locale]/summaries/[summaryId]/page.tsx` (414L)
    13. `apps/web/src/app/[locale]/admin-dashboard/page.tsx` (413L)
- [VERIFIED] `apps/web/vitest.config.ts:36-47` routes `.test.tsx` files through the `jsdom` project (`include: ['src/**/__tests__/**/*.test.tsx']`).

## Goal

Establish behavioral characterization tests for the highest-risk untested large web files (`profile/page.tsx`, `courses/[courseId]/page.tsx`, `subjects/[subject]/page.tsx`, `NewsClient.tsx`, `edit-summary/page.tsx`, `AppNav.tsx`, etc.) before refactoring them in `T-011`.

## Non-goals

- Do NOT refactor or split production source files here (deferred to `T-011`).
- Do NOT change `apps/web/vitest.config.ts` thresholds (handled in `T-016`).

## Steps

1. Prioritize the top untested pages/components that will be split first or carry core user flows: `profile/page.tsx` (820L), `subjects/[subject]/page.tsx` (549L), `courses/[courseId]/page.tsx` (541L), `NewsClient.tsx` (517L), `edit-summary/page.tsx` (510L), and `AppNav.tsx` (439L).
2. Add Vitest + React Testing Library (`jsdom`) unit tests under matching `__tests__/` directories (e.g. `apps/web/src/app/[locale]/profile/__tests__/page.test.tsx`, `apps/web/src/app/[locale]/courses/[courseId]/__tests__/page.test.tsx`, etc.) covering auth gating, loading/error states, and primary mutations using `apps/web/src/app/[locale]/login/__tests__/page.test.tsx:1-40` mocking conventions (`@/test/mocks/next-intl`).
3. If covering all 13 untested files exceeds ~1 day, ship tests for at least the top 6 (including `profile/page.tsx` and `courses/[courseId]/page.tsx` required by `T-011`) and open follow-up sub-cards for the remainder.
4. Run `pnpm --filter web test` and `pnpm --filter web lint` until green.

## Acceptance criteria

- [ ] `pnpm --filter web test` — exits 0 with new `__tests__/*.test.tsx` files passing for at least `profile/page.tsx`, `courses/[courseId]/page.tsx`, `subjects/[subject]/page.tsx`, `NewsClient.tsx`, `edit-summary/page.tsx`, and `AppNav.tsx`
- [ ] `pnpm --filter web lint` — exits 0
- [ ] `pnpm --filter web typecheck` — exits 0

## Evidence

## Rollback

Move newly added test files to `.trash/` per I9 (`git status` clean, existing suites untouched).

## Open questions

- None
