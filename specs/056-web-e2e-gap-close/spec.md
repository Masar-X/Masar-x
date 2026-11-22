# Spec 056 — Web e2e gap-close (P1)

> | | |
> |---|---|
> | **Branch** | `feat/056-web-e2e-gap-close` |
> | **Created** | 2026-11-22 |
> | **Status** | Approved (owner, 2026-11-22 — plan approval in session) |
> | **Type** | Test coverage (e2e-only + e2e-helper edit) |
> | **Baseline** | `origin/main` `5f33dad` (17 e2e specs / 35 tests) |
> | **Origin** | Automation-testing standard roadmap **P1** (docs/agents/references/13-automation-testing.md, PR #273) |

---

## 1. Context & problem statement

The web Playwright suite covers 17 specs / 35 tests, but ~15 user-facing flows have no e2e coverage (doc 13 §4 matrix). P1 closes the highest-value gaps with **deterministic, route-mocked specs** — the established `apps/web/e2e/` pattern (inline `page.route()` JSON, seeded-cookie auth, no test DB, no credentials, no app-side mock flag).

**Scope discovery (changes the doc-13 P1 row):** the seeded mock cookie is rejected by the real Supabase server-side, so the server always sees `user = null`. The middleware guards (`apps/web/src/lib/supabase/proxy.ts:66` `/non-academic*`, `:89` `/admin*` + `/admin-dashboard*`, `:112` `/profile*`, `/quiz-attempts*`, `/add-video*`, `/add-file*`) redirect to `/{locale}/login`, and `apps/web/src/app/[locale]/admin-dashboard/layout.tsx:26-40` adds a second server gate (login redirect → admins-table unauthorized redirect). This is correct security behavior for a corrupted/expired cookie — and it means **authed renders of profile, quiz-attempts, and admin-dashboard are unreachable with the current mock approach**. No existing authed spec touches those routes, which is why this was never observed.

**P1 re-scope (this spec):**

- Reachable flows get full specs: successful auth flows, quizzes list (guest/student/admin), lecture detail, TRW pages (anon gate + authed catalog/category/course/my-access), news + faq, downloads + waitlist, onboarding, **logout** (control lives in the nav on reachable pages).
- Walled routes get explicit redirect assertions + documentation (`protected-routes.spec.ts`) — the wall itself is the contract under test for those.
- **Follow-up (future spec, not here):** a local Supabase stub server wired as the e2e dev server's `NEXT_PUBLIC_SUPABASE_URL` would make server-side calls deterministic and unlock the walled authed renders. Doc 13's P1 row gets amended at ledger time.

## 2. Architecture & design

### 2.1 Deliverables

- `apps/web/e2e/helpers/auth.ts` — **test-side edit only**: `buildSeededSession(userId, opts?: { role?: string })` and `seedAuthedSession` role passthrough. `app_metadata` gains `role` only when requested (`{ provider: "email", providers: ["email"], ...(role ? { role } : {}) }`). Backward compatible — existing callers unchanged. This flips the client-side `isAdmin` (`AuthContext.tsx:193`, roles from `src/lib/auth/roles.ts`) so the quizzes admin-view test runs without touching production code.
- 9 new spec files (§4). **Zero production-code edits** — every target page already exposes stable id/aria/text selectors (verified page-by-page: login/signup testids, `#forgot-email`, `#new-password`/`#confirm-new-password`, `#profile-*` inputs, `#onboarding-*` selects, `#quiz-search` + `#quiz-filter-*`, faq `aria-expanded`/`aria-controls`, TRW gate fallback hardcoded EN "Access Required", downloads waitlist aria-label).

### 2.2 Mock architecture (unchanged conventions)

- Catch-all `**/rest/v1/**` → `[]` registered FIRST; specific handlers after (LIFO wins). Multi-shape tables branch inside one handler on the request URL/query (e.g. `trw_categories` serves the catalog array and the `select=id&slug=eq.` single).
- Authed specs: `seedAuthedSession(page, { baseURL, userId })` **before** `goto`; on non-onboarding authed pages the `profiles` mock must return non-null `level`/`semester` (AcademicOnboardingGate redirect trap — `quiz-finish.spec.ts` precedent `{ level: 3, semester: 1, department_id: DEPARTMENT_ID }`).
- Anonymous specs: `**/auth/v1/user` → `{id:null,email:null,aud:null}` + `**/auth/v1/token*` → `{error:"no_session"}`; truthiness trap — `{id:null}` still fires membership-style probes (`trw_memberships?user_id=eq.null`), so the probe table gets an explicit mock (`json: null` for `.maybeSingle()`).
- `platform_settings` mock returns ONE object (`.single()`), not an array.
- Unmockable server-side surfaces and how P1 treats them: admin-dashboard layout gate → redirect assertion; news SSR data fetch → shell-only asserts (client-side filter interaction still covered); downloads GitHub Releases fetch → soft hero assert + waitlist interaction (browser-mockable); realtime WebSockets → error-tolerant, ignored.
- Error-boundary regex guard on every navigation; ar-locale paths; assertion strings sourced from `packages/shared/src/messages/ar/*.json`.

### 2.3 Fixtures & identity allocation

- Deterministic UUIDs (`00000000-0000-4000-8000-…`), quiz/attempt timestamps in the past, stable sort orders.
- `USER_ID` suffix allocation (pattern `00000000-0000-4000-8000-00000000e2eN`; used: e2e1–e2e3): **e2e4** auth-success, **e2e5** reset-password, **e2e6** quizzes student, **e2e7** quizzes admin (role), **e2e8** TRW, **e2e9** onboarding, **e2e10** protected-routes/logout. Lecture-detail is guest-only (no profile dependencies).

## 3. Behavior preservation & regression strategy

- Production code untouched → zero behavior risk. The only non-e2e diff is the helper's optional role parameter (test-side).
- New specs are additive; no existing spec is modified. The suite stays fully parallel, chromium-only, `--no-proxy-server`, seeded-cookie auth (12-e2e-testing.md run contract unchanged).
- Risk register: news SSR data nondeterminism (shell-only asserts); downloads GitHub fetch rate-limiting (soft hero assert — hero OR error card, never the error boundary); lint warning budget (`--max-warnings=52` — new files must add zero warnings); strict typecheck (`noUnusedLocals`/`noUnusedParameters`) covers `apps/web/e2e/**`.

## 4. Test specification

| File | Tests | Contract |
|---|---|---|
| `auth-success.spec.ts` | 3 | Login success: `POST /auth/v1/token?grant_type=password` → full session shape; `**/rest/v1/analytics*` → 201 (login insert); `/api/auth/sync`, `/api/metrics/event` mocked → lands `/ar`, no error banner. Forgot-password: `#forgot-email` + `POST /auth/v1/recover` → `authPages.resetLinkSent` banner. Signup: `POST /auth/v1/signup` → `{user:{identities:[]}}` (no session — a session-shaped response would auto-login and redirect) → `signupConfirmationSent` banner, stays on `/signup` |
| `reset-password.spec.ts` | 3 | No-code visit → `resetPassword.invalidLinkError` + auto-push to login (~3s timer, generous wait). Valid `?code&type=recovery`: `token?grant_type=pkce` → session, `PUT /auth/v1/user` → success banner → `POST /auth/v1/logout?scope=global` → login. pkce 400 → `expiredLinkError` |
| `quizzes-list.spec.ts` | 3 | `**/rest/v1/quizzes*` → approved fixture; `**/rest/v1/subjects*` → fixture with `show_on_home: true` (guest subject gating). Guest: h1 `الامتحانات`, card h3 + `ابدأ الاختبار`, previous-exams button, `#quiz-search` filter interaction. Student (profiles L3/S1): same + previous-exams. Admin (role): h1 `إدارة الامتحانات` + new-exam button, no previous-exams button |
| `lecture-detail.spec.ts` | 2 | `{subject}` matched against `subjects.name` after decode + dash→space (case-sensitive PostgREST eq — mock name matches the URL slug). `subjects` → object (`.single()`); `subject_lectures` → `[{lecture_key:"lecture-1", lecture_label:…}]`; content tables → `[]` (tolerates the documented scoped→broad double-fetch). Valid key → LectureHero h1 + `subjectPage.lectureContent` badge + `subjectPage.noExams`; bogus key → plain dashboard (`subjectPage.lecturesList` h2) |
| `trw-pages.spec.ts` | 4 | Anon: in-page gate fallback (`/trw/*` is NOT middleware-guarded) — "Access Required". Authed + membership (`trw_memberships` object with `granted_at`, `revoked_at: null`): catalog h1 + category cards → category (courses cards, h1 = slug-with-spaces) → course detail (nested `trw_courses` single with modules/materials, `trw_user_progress` → `[]`, "Course Overview" + module titles) → my-access (`trwAccess.title`, `activeMembership`, `verifiedActive`) |
| `news-faq.spec.ts` | 3 | News shell-only: h1, category chips, `#news-search`, anon login-to-add button; filter click ≠ error boundary (no data asserts — SSR fetch unmockable). FAQ (static): h1, first item `aria-expanded=true`, clicking the second item flips it and reveals its `aria-controls` panel |
| `downloads.spec.ts` | 2 | Shell: soft hero assert (hero OR `downloads.error.title`, never the boundary) + "Windows"/"Android" cards + waitlist form. Waitlist: `POST /rest/v1/waitlist` 201 → `waitlist.success`; second submit 409 `{code:"23505"}` → `waitlist.duplicate` |
| `onboarding-academic.spec.ts` | 2 | Authed with profiles → all-null (gate exempts `/onboarding`, page auto-redirects only when both non-null): `#onboarding-level`/`#onboarding-semester` → `onboarding.academic.continue` → capture `POST /rest/v1/profiles?on_conflict=id` body (`semester_manually_set: false`) → `router.replace("/")`. Anon → client guard pushes `/ar/login` |
| `protected-routes.spec.ts` | 5 | The wall, asserted + documented: anon `/ar/profile` → `/ar/login`; **authed mock-cookie `/ar/profile` → still `/ar/login`** (wall proof); anon + authed `/ar/quiz-attempts` → `/ar/login`; authed `/ar/admin-dashboard` → `/ar/login`. Logout on `/ar/quizzes`: nav logout (`تسجيل الخروج`) → `POST /auth/v1/logout?scope=global` captured → lands `/` |

**Total: 9 files, 27 new tests → suite 35 → 62.**

## 5. Atomic execution plan

Each commit is independently green (targeted e2e run per wave; gates per 08-precommit.md):

1. `docs(specs): add spec 056 web e2e gap-close` — this spec dir.
2. `test(e2e): seeded-session role option + protected-route wall specs` — helper edit + `protected-routes.spec.ts`; targeted run green.
3. `test(e2e): auth success + reset-password flows` — both auth spec files; targeted run green.
4. `test(e2e): quizzes list + lecture detail specs` — targeted run green.
5. `test(e2e): trw pages, news/faq shell, downloads waitlist, onboarding` — four files; targeted run green.
6. Full suite + `pnpm --filter web typecheck` + `pnpm --filter web lint` → push → PR.

## Out of scope

- Local Supabase stub server (unlocks walled authed renders: profile, quiz-attempts, admin-dashboard, add-file/add-video, non-academic) — future spec.
- Uploads (`/add-file`, `/add-video`), summaries detail/edit, courses pages — later gap-close waves.
- Doc 13 matrix amendment + AGENTS.md ledger row — post-merge docs PR (per the #272 closeout pattern).
- Prod-code changes of any kind (none required — selector inventory verified).
