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
  - "apps/web/e2e/**"
owner_action: false
area: web
estimate: 1d
---

## Context

- [VERIFIED] `apps/web/e2e/` contains **27** `*.spec.ts` files; **24 of 27** use `page.route()` or `context.route()` to mock backend responses, and only **3** (`prod-smoke.spec.ts`, `schedules.spec.ts`, `study-flow.spec.ts`) run without route mocking.
- [VERIFIED] `AGENTS.md:81` (`056-web-e2e-gap-close`) records that seeded mock cookies are rejected by server-side `proxy.ts` against real Supabase, making authenticated SSR routes unreachable under `page.route()` mocks until a local Supabase stub/container path is used.
- [VERIFIED] All 4 Vitest configs explicitly set `coverage: { reporter: ['text', 'json-summary'] }` with **no thresholds** (report-only per spec 040): `apps/web/vitest.config.ts:21`, `packages/shared/vitest.config.ts:16`, `apps/desktop/vitest.config.ts:15`, and `apps/mobile/vitest.config.ts:18`.
- [VERIFIED] `.github/workflows/ci.yml:363-368` runs `pnpm --filter <pkg> test:coverage` for all 4 workspaces and uploads `coverage-summary.json` artifacts (`:370-380`).
- [INFERRED] Current baseline coverage percentages must be measured from `pnpm --filter <pkg> test:coverage` before setting per-workspace `coverage.thresholds` (`floor = measured - 2%`) so CI does not immediately turn red.

## Goal

Establish a non-regressing Vitest coverage threshold ratchet across all 4 workspaces and reduce `apps/web/e2e` reliance on `page.route()` backend mocks for public/read-only flows (starting with unmocking or adding real-server coverage for core read paths).

## Non-goals

- Do NOT stand up a full local Supabase Docker stack in CI (`ci.yml` `e2e` job runs against configured public Supabase variables; full local Supabase stub is a separate spec per `AGENTS.md:81`).
- Do NOT set arbitrary high coverage targets (e.g., 80%) that break CI today; ratchet from measured baseline.

## Steps

1. Run `pnpm --filter web test:coverage`, `pnpm --filter desktop test:coverage`, `pnpm --filter mobile test:coverage`, and `pnpm --filter masarx-shared test:coverage` locally and record exact `lines`/`branches`/`functions`/`statements` percentages.
2. Add `thresholds` to `coverage` in `apps/web/vitest.config.ts:21`, `packages/shared/vitest.config.ts:16`, `apps/desktop/vitest.config.ts:15`, and `apps/mobile/vitest.config.ts:18` set just below measured baselines (e.g. `measured - 2%` floor ratchet).
3. Audit the 24 mocked `apps/web/e2e/*.spec.ts` files to identify public/read-only flows (e.g., `/news`, `/faq`, `/subjects`, `/materials`, `/trw` catalog) that can run against real seeded public Supabase data without `page.route()` mocks, and convert at least 2-3 specs (or add unmocked smoke assertions) while keeping auth/destructive mutations isolated.
4. Re-run all 4 `test:coverage` suites and `pnpm --filter web test:e2e` (where env is configured) to verify green thresholds.

## Acceptance criteria

- [ ] `pnpm --filter web test:coverage && pnpm --filter desktop test:coverage && pnpm --filter mobile test:coverage && pnpm --filter masarx-shared test:coverage` — all 4 exit 0 enforcing non-zero `coverage.thresholds`
- [ ] `rg -l "page\.route|context\.route" apps/web/e2e/*.spec.ts | wc -l` — reduced below 24/27 with converted specs documented in `## Evidence`

## Evidence

## Rollback

Remove `coverage.thresholds` from the 4 `vitest.config.ts` files and revert converted `apps/web/e2e/*.spec.ts` files.

## Open questions

- Which public `apps/web/e2e/*.spec.ts` specs have stable enough public Supabase seed data in CI (`vars.NEXT_PUBLIC_SUPABASE_URL`) to run unmocked without flake?
