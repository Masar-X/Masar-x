---
id: T-016
title: "Reduce e2e backend mocking and add Vitest coverage threshold ratchet"
priority: P2
status: todo
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

- [ ] `pnpm --filter web test:coverage && pnpm --filter desktop test:coverage && pnpm --filter mobile test:coverage && pnpm --filter masarx-shared test:coverage` — all 4 exit 0 enforcing non-zero `coverage.thresholds`
- [ ] `rg -l "page\.route|context\.route" apps/web/e2e/*.spec.ts | wc -l` — reduced below 24/27 with unmocked public-read specs passing against real CI Supabase seed data

## Evidence

## Rollback

Remove `coverage.thresholds` from the 4 `vitest.config.ts` files and restore `page.route()` mocks in converted `apps/web/e2e/*.spec.ts` files.

## Open questions

- None (public seed data stability is verified directly during Step 3).
