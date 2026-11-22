# Spec 056 — tasks

Wave gates: targeted `E2E_PORT=<fresh> pnpm --filter web test:e2e -- <spec-file>` must be green before each commit; the full suite + `typecheck` + `lint` gate the final push.

## Wave 1 — spec (commit `docs(specs): add spec 056 web e2e gap-close`)

- [x] Worktree `../masarx-wt/feat-056` on `feat/056-web-e2e-gap-close` (origin/main `5f33dad`); `apps/web/.env.local` copied (gotcha §22)
- [x] Spec number disk-derived: max 055 on disk → 056
- [x] spec.md + tasks.md written

## Wave 2 — helper + walls (commit `test(e2e): seeded-session role option + protected-route wall specs`)

- [ ] `helpers/auth.ts`: `buildSeededSession(userId, opts?: { role?: string })` + `seedAuthedSession` passthrough (backward compatible)
- [ ] `protected-routes.spec.ts`: anon /ar/profile → login; authed /ar/profile → login (wall proof); anon + authed /ar/quiz-attempts → login; authed /ar/admin-dashboard → login; logout from /ar/quizzes (capture `POST /auth/v1/logout?scope=global`, lands `/`)
- [ ] Gate: targeted run green

## Wave 3 — auth success flows (commit `test(e2e): auth success + reset-password flows`)

- [ ] `auth-success.spec.ts`: login success → `/ar`; forgot-password banner; signup confirmation banner
- [ ] `reset-password.spec.ts`: invalid link + auto-push; valid code (pkce + PUT user + logout) → success → login; pkce 400 → expired banner
- [ ] Gate: targeted run green

## Wave 4 — academic content (commit `test(e2e): quizzes list + lecture detail specs`)

- [ ] `quizzes-list.spec.ts`: guest (h1 + cards + start + previous-exams + search filter); student (profiles L3/S1); admin (role → manageExams + new-exam, no previous-exams)
- [ ] `lecture-detail.spec.ts`: valid lecture key (hero h1 + badge + noExams); bogus key → plain dashboard
- [ ] Gate: targeted run green

## Wave 5 — TRW + public pages (commit `test(e2e): trw pages, news/faq shell, downloads waitlist, onboarding`)

- [ ] `trw-pages.spec.ts`: anon gate fallback; authed catalog → category → course detail; my-access
- [ ] `news-faq.spec.ts`: news shell + filter click; faq accordion
- [ ] `downloads.spec.ts`: shell (soft hero) + waitlist success/duplicate
- [ ] `onboarding-academic.spec.ts`: authed submit (capture upsert body) → home; anon → login
- [ ] Gate: targeted run green

## Wave 6 — ship

- [ ] Full e2e suite green locally (62 tests)
- [ ] `pnpm --filter web typecheck` + `pnpm --filter web lint` green (zero new warnings)
- [ ] Push → PR → CI green → owner merge
- [ ] Post-merge follow-ups: AGENTS.md ledger row + doc 13 P1 row amendment (walls + local-stub follow-up)
