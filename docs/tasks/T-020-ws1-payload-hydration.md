---
id: T-020
title: "WS1 payload/hydration wave: dynamic admin, deferred ai-assistant fetches, lazy MobileNav, slim RSC user"
priority: P1
status: done
depends_on: []
touches:
  - "apps/web/src/app/[locale]/admin-dashboard/page.tsx"
  - "apps/web/src/app/[locale]/ai-assistant/page.tsx"
  - "apps/web/src/hooks/useQuizzes.ts"
  - "apps/web/src/hooks/useSubjects.ts"
  - "apps/web/src/components/sidenav/AppNav.tsx"
  - "apps/web/src/app/[locale]/layout.tsx"
  - "apps/web/src/contexts/AuthContext.tsx"
  - "apps/web/src/components/AppProviders.tsx"
  - "apps/web/src/lib/slimAuthUser.ts"
  - "apps/web/src/lib/__tests__/slimAuthUser.test.ts"
  - "apps/web/src/hooks/__tests__/useQuizzes.test.tsx"
  - "specs/060-ws1-payload-hydration/**"
  - "docs/tasks/T-020-ws1-payload-hydration.md"
  - "docs/tasks/T-021-i18n-namespace-subsets.md"
owner_action: false
area: web
estimate: 1d
---

## Context

- Observed: `admin-dashboard/page.tsx` statically imports 11 tab/modal components and always-mounts the 4 modals (`page.tsx:359-406`) — audit [09 ADMIN-1](../perf/audit-2026-11-02/findings/09-admin.md).
- Observed: `ai-assistant/page.tsx:144-147` fetches subjects + the full `quizzes_with_ratings` table on every load although the data feeds only ChatHeader's student_agent pickers (`ChatHeader.tsx:12-16,43`; `LocalQuizPreviewModal.tsx:13-22` takes neither) — audit [04 SPLIT-3](../perf/audit-2026-11-02/findings/04-splitting-streaming.md) with a corrected trigger (spec 060 §2.2).
- Observed: `sidenav/AppNav.tsx:12` statically imports `header/MobileNav.tsx` (framer-motion) which renders only the mobile drawer — audit [01 BUNDLE-2](../perf/audit-2026-11-02/findings/01-bundle-dependencies.md) at its current import site (the audit's Header.tsx reference is stale).
- Observed: `[locale]/layout.tsx:88-92` serializes the full Supabase `User` into the RSC payload on every route — audit [04 SPLIT-4](../perf/audit-2026-11-02/findings/04-splitting-streaming.md).
- Umbrella: #288 (WS1 = recommended first wave; owner-picked 2026-11-27). Spec: [060-ws1-payload-hydration](../specs/060-ws1-payload-hydration/spec.md).

## Goal

Ship audit WS1 minus the i18n namespace subset (deferred to T-021): code-split the 11 admin chunks, defer the ai-assistant subjects/quizzes fetches until the student_agent pickers are active, lazy-load MobileNav behind a first-open latch, and slim the serialized RSC user to the fields clients actually read.

## Non-goals

- i18n namespace subsets (T-021, own hydration-risk surface).
- WS2/WS3/WS5/WS7 items and the quiz-play LCP attribution pass (own specs per #288).
- Admin-layout server gate changes (WS2 owns MID-2's dedupe).
- admin-shell MobileNav deferral (admin-route scoped).

## Steps

1. Admin: convert the 7 tabs + 4 modals to `memo(dynamic(…, { ssr: false }))` (quizzes-page precedent), conditionally mount modals only while open, keep `AdminOverviewTab` static, make `CoursesTabCourse` a type-only import.
2. ai-assistant: hoist `generatedQuiz` state above the hook calls, add `studentPickersActive = mode === "student_agent" || generatedQuiz !== null`, pass `enabled: studentPickersActive` to both hooks; add `enabled` options to `useQuizzes` (gates the mount fetch) and `useSubjects` (ANDed with the internal gate), both default `true`.
3. MobileNav: `next/dynamic` in `AppNav.tsx` behind a `mobileNavEverOpened` latch; escape/scroll-lock effects stay in AppNav.
4. RSC user: `SlimAuthUser` Pick type + `toSlimAuthUser()` helper (unit-tested); layout maps before `AppProviders`; `AuthProvider.initialUser` widens to `SlimAuthUser | null`, context user state to `User | SlimAuthUser | null`.
5. Verify: tasks gates, web vitest (+ new tests), tsc, lint, full CI incl. e2e sidenav specs.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [x] `admin-dashboard/page.tsx` has zero static imports of the 11 components (7 tabs + 4 modals) and `AdminOverviewTab` stays static; modals render only while open.
  evidence: `grep -nE "^import \{ (NewsTab|AppealsTab|QuizzesTab|AddNewsModal|PageManagementTab|AddCourseModal|SubjectsTab|AddSubjectModal|ManageLecturesModal) |^import \{ CoursesEnrollmentsView|from \"\./AdminAnalyticsPage\"" page.tsx` → no matches (zero static value imports of the 11); `grep -n "^import { AdminOverviewTab }"` → line 17 (landing tab still static); all 4 modals now behind `{showX ? <LazyXModal/> : null}` gates (`grep -cE "\? \(|: null\}"` → 13 gate sites); `CoursesTabCourse` is a type-only import.
- [x] `useQuizzes`/`useSubjects` fetch nothing for the ai-assistant call sites until `studentPickersActive` flips true; all other consumers unchanged (default `enabled: true`).
  evidence: `npx vitest run src/hooks/__tests__/useQuizzes.test.tsx` → 3 passed: "fetches on mount by default — admin consumers unchanged" (no options → from-call recorded), "fetches nothing while enabled: false" (zero `from` calls after mount + settle), "fetches when the gate flips false → true" (from-call appears only after flip). `useSubjects` gate ANDed at its query `enabled` (params.enabled ?? true), covered by the existing 11-case suite.
- [x] `AppNav.tsx` imports MobileNav via `next/dynamic` and mounts it only after the first menu open; framer-motion no longer parses on initial route load.
  evidence: `grep -n "const MobileNav = dynamic\|mobileNavEverOpened ? (" AppNav.tsx` → line 22 (`dynamic(..., { ssr: false })`) and line 435 (`{mobileNavEverOpened ? <MobileNav .../> : null}`); static `import { MobileNav }` removed. `npx vitest run src/components/sidenav/__tests__/AppNav.test.tsx` → 12 passed (the first-open test now awaits the async chunk resolution; later opens use the cached module).
- [x] The RSC payload receives `SlimAuthUser` (id/email/app_metadata/user_metadata/created_at/last_sign_in_at only) — `toSlimAuthUser` unit test + `useQuizzes` enabled-flag tests green.
  evidence: `npx vitest run src/lib/__tests__/slimAuthUser.test.ts` → 2 passed ("keeps exactly id/email/app_metadata/user_metadata/created_at/last_sign_in_at" — identities/factors/aud asserted absent; null-metadata tolerance). layout.tsx passes `user ? toSlimAuthUser(user) : null`; `AuthProvider.initialUser` is `SlimAuthUser | null`, context state `User | SlimAuthUser | null`; the 4 consumer sinks widened (`useAiChat`, `useConversations`, `runSendMessage` params, `useProfileEditor`, `StudyWorkspace`/`AssistantPanel` props — all read only picked fields).
- [x] `pnpm tasks:lint` and `pnpm tasks:test` exit 0; web vitest, tsc, eslint green; CI e2e (incl. sidenav specs) green.
  evidence: `pnpm tasks:lint` → `OK (26 card(s) checked)`; `pnpm tasks:test` → exit 0; `npx vitest run` (full web) → `Test Files 115 passed (115)`, `Tests 1292 passed (1292)`, exit 0; `pnpm --filter web typecheck` → 0 errors; `pnpm --filter web lint` → exit 0, 0 errors (36 warnings, all pre-existing on main — verified by running eslint on `AuthContext.tsx`/`useQuizzes.ts` from the main checkout: same rules at pre-edit line numbers). CI e2e runs on the PR (watched below).

## Evidence

- All acceptance evidence is inline above (per-item `evidence:` lines), gathered 2026-11-27 in worktree `C:/programming/WEB_Development/projects/masarx-wt/task-T-020` on branch `task/T-020-ws1-payload-hydration`.
- tsc-driven consumer audit: the initial SlimAuthUser Pick (4 fields) was widened to include `created_at`/`last_sign_in_at` after `pnpm --filter web typecheck` surfaced `profile/page.tsx:171-172` (ActivityLogSection) — a consumer the audit's manual sweep missed. This is why the typecheck gate ran before the evidence pass.
- CI run on the finishing PR: recorded in the PR body (next build / workspaces / e2e incl. sidenav specs / Vercel all green before merge).

## Rollback

Single-commit revert of the PR restores every file (all edits are self-contained per file; hooks' `enabled` options default to the old behavior, dynamic imports fall back to static by reverting the import block). No data or schema involved.

## Open questions

- None — the ai-assistant deferral trigger was corrected against current code during scoping (spec 060 §2.2 documents the stale-audit wording it supersedes).
