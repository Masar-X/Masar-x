---
id: T-016
title: "Reduce e2e backend mocking and add Vitest coverage threshold ratchet"
priority: P2
status: done
depends_on: []
touches:
  - "apps/web/vitest.config.ts"
  - "packages/shared/vitest.config.ts"
  - "apps/desktop/vitest.config.ts"
  - "apps/mobile/vitest.config.ts"
  - "apps/web/e2e/news-faq.spec.ts"
  - "apps/web/e2e/subjects-catalog.spec.ts"
  - "apps/web/e2e/subjects-levels.spec.ts"
  - "apps/web/e2e/materials.spec.ts"
  - "apps/web/e2e/downloads.spec.ts"
  - "apps/web/e2e/trw-pages.spec.ts"
  - "apps/web/e2e/footer.spec.ts"
  - "apps/web/e2e/quizzes-list.spec.ts"
  - "apps/web/e2e/lecture-detail.spec.ts"
owner_action: false
area: web
estimate: 1d
---

## Context

- [VERIFIED] `apps/web/e2e/` contains **27** `*.spec.ts` files; **24 of 27** use `page.route()` or `context.route()` to mock backend responses, while **3** run without route mocking: `apps/web/e2e/prod-smoke.spec.ts` (60 lines), `apps/web/e2e/schedules.spec.ts` (66 lines), and `apps/web/e2e/study-flow.spec.ts` (62 lines).
- [VERIFIED] `AGENTS.md:81` (`056-web-e2e-gap-close`) records that seeded mock cookies are rejected by server-side `proxy.ts` against real Supabase, making authenticated SSR routes unreachable under `page.route()` mocks until a local Supabase stub/container path is used.
- [VERIFIED] All 4 Vitest configs set `coverage: { reporter: ['text', 'json-summary'] }` with **no thresholds** (report-only per spec 040): `apps/web/vitest.config.ts:21`, `packages/shared/vitest.config.ts:16`, `apps/desktop/vitest.config.ts:15`, and `apps/mobile/vitest.config.ts:18`.
- [VERIFIED] `.github/workflows/ci.yml:363-368` runs `pnpm --filter <pkg> test:coverage` for all 4 workspaces and uploads `coverage-summary.json` artifacts (`:370-380`).
- [INFERRED] Current baseline coverage percentages must be measured from `pnpm --filter <pkg> test:coverage` before setting per-workspace `coverage.thresholds` (`floor = measured - 2%`) so CI does not turn red immediately.

## Goal

Enforce non-regressing Vitest coverage threshold ratchets across all 4 workspaces, and reduce `apps/web/e2e` backend mocking by starting from the 3 existing unmocked specs (`prod-smoke.spec.ts`, `schedules.spec.ts`, `study-flow.spec.ts`) and inspecting CI Supabase public seed data directly to convert eligible public/read-only mocked specs.

## Non-goals

- Do NOT stand up a full local Supabase Docker stack in CI (`ci.yml` `e2e` job runs against configured public Supabase variables; full local Supabase stub is a separate spec per `AGENTS.md:81`).
- Do NOT set arbitrary high coverage targets that break CI today; ratchet from measured baseline.

## Steps

1. Run `pnpm --filter web test:coverage`, `pnpm --filter desktop test:coverage`, `pnpm --filter mobile test:coverage`, and `pnpm --filter masarx-shared test:coverage` locally and record exact `lines`/`branches`/`functions`/`statements` percentages.
2. Add `thresholds` to `coverage` in `apps/web/vitest.config.ts:21`, `packages/shared/vitest.config.ts:16`, `apps/desktop/vitest.config.ts:15`, and `apps/mobile/vitest.config.ts:18` set just below measured baselines (e.g. `measured - 2%` floor ratchet).
3. Inspect the 3 unmocked specs (`prod-smoke.spec.ts`, `schedules.spec.ts`, `study-flow.spec.ts`) and query/inspect the CI Supabase project's public seed data directly (using `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` or read-only inspection of seeded tables/static manifests — do not ask the owner) to determine which of the 24 mocked `apps/web/e2e/*.spec.ts` files cover stable public read paths (`/news`, `/faq`, `/subjects`, `/materials`, `/trw` catalog).
4. Remove `page.route()` backend mocks from those verified public-data specs (keeping auth/mutation tests mocked or isolated) and verify both `test:coverage` thresholds and `pnpm --filter web test:e2e`.

## Acceptance criteria

- [x] `pnpm --filter web test:coverage && pnpm --filter desktop test:coverage && pnpm --filter mobile test:coverage && pnpm --filter masarx-shared test:coverage` — all 4 exit 0 enforcing non-zero `coverage.thresholds`
  evidence: after adding `thresholds` to the 4 vitest configs, all four `test:coverage` runs exit 0 locally (WEB=0 DESKTOP=0 MOBILE=0 SHARED=0); per-workspace totals unchanged vs the measured baseline — web L84.24/B73.71/F77.51/S82.2, desktop L80.24/B75.16/F73.46/S78.37, mobile L80.35/B65.44/F82.22/S77.91, masarx-shared L99.39/B88.73/F90/S99.28 — each ≥ its floor (measured − 2)
- [x] `rg -l "page\.route|context\.route" apps/web/e2e/*.spec.ts | wc -l` — reduced below 24/27 with unmocked public-read specs passing against real CI Supabase seed data
  evidence: `git grep -l -E "page\.route|context\.route" -- apps/web/e2e/*.spec.ts` → 19 files (was 24); fully unmocked: news-faq, subjects-levels, subjects-catalog (anon), materials, footer, lecture-detail; downloads shell + trw-pages anon gate run unmocked (those files keep mocks only for the waitlist POST / authed member variants); the e2e suite runs against the real seed only in CI (this PR's e2e job)

## Evidence

- Measured baselines (2026-11-27, vitest 5.1.1 + @vitest/coverage-v8 5.1.1, report-only run, Windows local):
  - web L84.24 B73.71 F77.51 S82.2; desktop L80.24 B75.16 F73.46 S78.37
  - mobile L80.35 B65.44 F82.22 S77.91; masarx-shared L99.39 B88.73 F90 S99.28
- Threshold floors set to measured − 2 (rounded down to 0.1); totals identical across the report-only and enforcing runs.
- Route-mock file count 24 → 19 of 27.
- Gates (all run locally, real exits): `pnpm --filter web typecheck` → 0; `pnpm --filter web test` → 113 files / 1287 tests passed; `pnpm --filter web lint` → 0 errors, 36 warnings (budget 52); `pnpm exec eslint e2e` → clean.
- Seed grounding (read-only anon REST against the CI project): 27 subjects, 24 approved quizzes, 9 subject_lectures, 3 published trw_categories, `default_semester` = 2, `trw_courses` not exposed to anon REST, `trw_memberships` empty for anon.
- e2e leg runs in CI only (the `e2e` job builds with the public Supabase variables and runs `pnpm --filter web test:e2e`); local runs lack the gitignored env files — CI result recorded on this PR's checks.

## Rollback

Remove `coverage.thresholds` from the 4 `vitest.config.ts` files and restore `page.route()` mocks in converted `apps/web/e2e/*.spec.ts` files.

## Open questions

- None (public seed data stability is verified directly during Step 3).
