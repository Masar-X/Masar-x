# Spec 060: WS1 payload/hydration wave (perf-audit umbrella #288)

> Status: card-driven execution — `docs/tasks/T-020` (masarx-ops loop); the owner picked WS1 from #288's queue (2026-11-27). Refs #288 (umbrella; WS1 is the recommended first wave per `sandbox/handoff-2026-11-22/CHECKLIST.md` T17).
> Numbering: derived from disk — `specs/` ends at `059-expo-sdk-upgrade`; next free number = 060.
> Baseline: audit dated 2026-11-02 with findings re-verified 2026-11-22 in #288; every file/line claim below re-verified against `main` @ `7ef55e0` in this worktree before implementation.

## 1. Context & problem statement

Four payload/hydration costs ship on routes that never use them (audit [09 ADMIN-1](../../docs/perf/audit-2026-11-02/findings/09-admin.md), [04 SPLIT-3/4](../../docs/perf/audit-2026-11-02/findings/04-splitting-streaming.md), [01 BUNDLE-2/3](../../docs/perf/audit-2026-11-02/findings/01-bundle-dependencies.md)):

1. **Admin bundle** — `admin-dashboard/page.tsx` statically imports 11 tab/modal components (7 tabs + 4 modals); all 11 chunks parse on the first admin paint even though only the landing tab renders. Modals are *always mounted* (page.tsx:359-406) with visibility via props, so they never benefit from splitting as-is.
2. **ai-assistant over-fetch** — the page calls `useSubjects()` and `useQuizzes()` on mount; `useQuizzes` runs an unbounded `quizzes_with_ratings .select("*")` fetch (useQuizzes.ts:43-51) on every page load. Re-verified data flow: `LocalQuizPreviewModal` takes **no** subjects/quizzes props (`LocalQuizPreviewModal.tsx:13-22`) — the audit's "defer until the modal opens" wording is stale. The data feeds only `ChatHeader`'s student_agent pickers (`ChatHeader.tsx:12-16,43` — rendered when `mode === "student_agent" || generatedQuiz?.data`).
3. **MobileNav** — `header/MobileNav.tsx` (341 lines, imports framer-motion) is statically imported by `sidenav/AppNav.tsx:12` and rendered unconditionally, so framer-motion parses on every route although the component renders the drawer only when the mobile menu opens. (The audit's `Header.tsx:18` import site is stale — Header was retired for the sidenav rail, owner decision 2026-11-05.)
4. **RSC user payload** — `[locale]/layout.tsx:88-92` passes the **full Supabase `User`** (`getCachedUser()` → `AppProviders` → `AuthProvider initialUser`) into the RSC payload on every route: `identities[]`, `factors[]`, and full metadata blobs are serialized although client consumers read only `id`, `email`, `app_metadata.role` (admin-dashboard/page.tsx:117, profile/page.tsx:44, useCourseDetail.ts:105) and `user_metadata.{full_name, avatar_url, username}` (AdminTopbar.tsx:111, admin-shell/Sidebar.tsx:74, header/UserMenu.tsx:36-43, header/MobileNav.tsx:161, AdminProfileImage.tsx:29, AppealFormModal.tsx:27), plus `created_at`/`last_sign_in_at` (profile page's ActivityLogSection — found by tsc during implementation, not by the audit's consumer sweep).

## 2. Architecture & design

### 2.1 Admin tabs/modals → `next/dynamic` (11 components)

- Pattern mirrors the existing precedents (`quizzes/page.tsx:24-45`, `ai-assistant/page.tsx:31-46`): `dynamic(() => import("…").then((m) => m.X), { ssr: false })`.
- `ssr: false` is safe here (unlike the SPLIT-1 lesson recorded in `Layout.tsx:24-30`): `AdminDashboardContent` renders only after the `isMounted` + auth spinner gate (page.tsx:83-111), so the lazy chunks are post-gate content, not always-visible chrome.
- Tabs keep their re-render guard by wrapping: `memo(dynamic(…))` at module scope (replaces the old `memo(X)` wrappers).
- The 4 modals become **conditionally mounted** (`{showX ? <LazyX …/> : null}`) — an always-mounted dynamic modal would fetch its chunk up front and save nothing. All modal state is controlled from the page/hook (`showAddCourse`, `showAddSubject`, `showManageLectures`, `newsHook.showAddNews`), so unmounting on close is behavior-preserving.
- `AdminOverviewTab` (the landing tab) stays static — splitting the default tab would trade first-open latency for nothing.
- `CoursesTabCourse` becomes a pure `import type` (value import removed).

### 2.2 ai-assistant fetch deferral (corrected trigger)

- Deferral flag: `studentPickersActive = mode === "student_agent" || generatedQuiz !== null` — exactly the condition under which `ChatHeader` renders the pickers (re-verified: pickers render on `mode === "student_agent" || generatedQuiz?.data`).
- `useQuizzes` gains `options: { enabled?: boolean }` (default `true`) gating the mount fetch; `useSubjects` gains an `enabled` param ANDed with its internal query gate. Both defaults keep every existing consumer (admin, home, catalog) unchanged.
- Trade-off (accepted, audit intent): the first switch into student_agent mode pays the fetch latency; subjects reuses the TanStack cache (staleTime 5 min) and quizzes keeps its module-level inflight dedupe + cache.
- `studentSubjects`/`studentQuizzes` have no other consumers (grep-verified: only the ChatHeader props at page.tsx:279-283).

### 2.3 Lazy MobileNav

- `AppNav.tsx` switches to `dynamic(() => import("@/components/header/MobileNav").then((m) => m.MobileNav), { ssr: false })` and mounts it behind a first-open latch (`mobileNavEverOpened`) so re-opens don't remount and the closed state costs nothing. framer-motion leaves the initial AppNav chunk.
- Escape/scroll-lock effects already live in `AppNav.tsx:91-116` and stay untouched.
- The admin-shell `MobileNav` (admin-route scoped, already gated by its own `everOpened`) is out of scope — low value.

### 2.4 RSC user slimming

- New `SlimAuthUser = Pick<User, "id" | "email" | "app_metadata" | "user_metadata" | "created_at" | "last_sign_in_at">` + a unit-tested `toSlimAuthUser()` helper live in `lib/slimAuthUser.ts` (single dependency-light module; `AuthContext`, `AppProviders` and the layout import from it).
- `AuthProvider.initialUser` widens to `SlimAuthUser | null`; the context user state becomes `User | SlimAuthUser | null`. Client-side `initializeAuth` / `onAuthStateChange` still replace it with the **full** `User` post-mount — runtime behavior unchanged; the `loading = useState(!initialUser)` truthiness gate keeps working (a slim object is truthy exactly when a full one was).
- Server layout maps the full user → slim subset before `AppProviders`; `identities[]`/`factors[]` never reach the RSC payload. This is the SPLIT-4 half of audit item 4; precedent for the mapping is the camelCase profile subset in the same file (layout.tsx:100-113).

### 2.5 i18n namespace subsets → deferred to T-021

The other half of audit item 4 (chrome-subset of i18n namespaces to `NextIntlClientProvider`) is **explicitly deferred** to card T-021: `i18n/request.ts:218-229` loads ALL namespaces deliberately ("to prevent stale provider issues during SPA navigation"), there is no subset/pick prior art in the repo, and the blast radius is every `useTranslations("ns")` reachable from client chrome (hydration-miss = thrown missing-message errors). Splitting per the card-sizing rule (split cards bigger than ~1d) keeps this wave's risk surface mechanical; T-021 owns the namespace-dependency pass on top of this landed baseline.

## 3. Non-goals

- No WS2/WS3/WS5/WS7 items (separate specs per the umbrella's scope guard) and no quiz-play LCP attribution pass.
- No admin-layout re-gate changes — the server gate (`admin-dashboard/layout.tsx`) stays untouched (WS2 owns MID-2's dedupe).
- No admin-shell MobileNav deferral.
- No i18n provider changes (T-021).
- No migrations or edge-function changes.

## 4. Verification (done when)

- `pnpm tasks:lint` + `pnpm tasks:test` exit 0.
- `pnpm --filter web test` (vitest) green, including the new `toSlimAuthUser` unit test and the `useQuizzes` enabled-flag tests.
- `pnpm --filter web typecheck` + `pnpm --filter web lint` (workspace-wide equivalents in CI) exit 0.
- CI: `next build`, `workspaces`, `e2e` (sidenav specs must stay green with the lazy MobileNav), `gitleaks-artifacts`, Vercel — all green on the PR.
- Admin e2e/vitest surfaces that exercise tabs still pass (dynamic components resolve under the existing test setup; any `next/dynamic` handling mirrors how `quizzes/page.tsx` is already tested).
