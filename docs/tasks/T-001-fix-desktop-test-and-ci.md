---
id: T-001
title: "Fix failing desktop test and green CI test job"
priority: P0
status: done
depends_on: []
touches:
  - "apps/desktop/src/main/__tests__/main.test.ts"
owner_action: false
area: desktop
estimate: 0.5d
---

## Context

- [VERIFIED] The failing test lives in `apps/desktop/src/main/__tests__/main.test.ts:761-775` (note: directory is `__tests__/`, not `tests/` as reported in the earlier audit).
- [VERIFIED] Recent CI `test` job runs on `main` (`45086856930` on `0e76c4d`, `45086452278` on `01f3530`) and PR `45086558447` failed on `.github/workflows/ci.yml:344-368` (`pnpm --filter desktop test:coverage`) with `AssertionError: expected { status: 'disabled' } to deeply equal { status: 'rate-limited' }` at `apps/desktop/src/main/__tests__/main.test.ts:774`.
- [VERIFIED] By contrast, PR #310's `test` job (`actions/runs/45448751059/job/138639682678`) passed (`conclusion: success`), showing the failure is intermittent/flaky or order-dependent rather than a deterministic failure on every runner.
- [VERIFIED] `startMainProcess()` (`apps/desktop/src/main/index.ts:428-436`) creates an `Updater` and calls `bootUpdater()`, which starts `opts.updater.checkOnStartup()` fire-and-forget (`apps/desktop/src/main/updater.ts:436-445`).
- [VERIFIED] `checkOnStartup()` awaits async filesystem IO (`readVersionMarker` and `writeVersionMarker` at `apps/desktop/src/main/updater.ts:167-168`) before stamping `this.lastCheckAt = Date.now()` and invoking `this.au.checkForUpdates()` (`apps/desktop/src/main/updater.ts:201-202`).
- [VERIFIED] In `apps/desktop/src/main/__tests__/main.test.ts:761-775`, prior tests in the same `describe` block also call `startMainProcess()`, leaving unawaited `checkOnStartup()` promises in flight; calling `checkForUpdates.mockClear()` (`apps/desktop/src/main/__tests__/main.test.ts:763`) and awaiting `vi.waitFor(() => expect(checkForUpdates).toHaveBeenCalled())` (`apps/desktop/src/main/__tests__/main.test.ts:769-771`) can resolve on a prior test's `checkOnStartup()` call before the current test's `Updater` stamps `lastCheckAt`, causing `updater.checkFor()` (`apps/desktop/src/main/updater.ts:217-233`) to hit the mock returning `null` (`apps/desktop/src/main/__tests__/main.test.ts:274`) and resolve `{ status: 'disabled' }`.
- [INFERRED] Local `vitest` execution could not be reproduced in this worktree because `node_modules` is absent here (and the primary checkout lacks `@vitest/utils`).

## Goal

Determine whether `apps/desktop/src/main/__tests__/main.test.ts:774` is flaky/order-dependent or already resolved, and eliminate any async race so `pnpm --filter desktop test` and the CI `test` job (`.github/workflows/ci.yml:344-368`) pass deterministically across repeated runs.

## Non-goals

- Changing production startup update behavior or `Updater.checkFor()` semantics (`apps/desktop/src/main/updater.ts`).
- Promoting `test` to a required GitHub ruleset check (tracked in `T-002`).
- Disabling unsigned auto-download/install defaults (tracked in `T-005`).

## Steps

1. Before editing, determine whether `apps/desktop/src/main/__tests__/main.test.ts:774` is flaky/order-dependent (given PR #310's `test` job `45448751059/job/138639682678` passed while earlier `main` runs `45086856930` and `45086452278` failed) or was already fixed on a recent commit by inspecting `git log -n 5 apps/desktop/src/main/__tests__/main.test.ts` and running `pnpm --filter desktop test` repeatedly (including isolated vs full-file runs).
2. Isolate the `updates:check` rate-limit test in `apps/desktop/src/main/__tests__/main.test.ts:761-775` from lingering `checkOnStartup()` calls from earlier tests (e.g., use a deterministic `checkForUpdates` spy/deferred promise or `afterEach` microtask/fs flush, and verify the call came from the current `startMainProcess()` invocation rather than an earlier test).
3. Run the desktop test suite repeatedly (e.g. 5–10 consecutive runs) and run the full workspace test command matching `.github/workflows/ci.yml:364-368`.
4. Confirm CI `test` job is green on the PR.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [x] `pnpm --filter desktop test` passes 100% across 5 consecutive runs with 0 failures in `apps/desktop/src/main/__tests__/main.test.ts`.
  evidence: 5 consecutive runs of `pnpm --filter desktop test` all exited 0 (`6 passed | 1 skipped (7)` files, `68 passed | 4 skipped (72)` tests, `main.test.ts` 22/22 on runs 1–5; durations 6.26s, 6.16s, 6.11s, 6.09s, 6.11s); `pnpm --filter desktop test:coverage` also exited 0 (`68 passed | 4 skipped`).
- [x] `pnpm --filter desktop typecheck && pnpm --filter desktop lint` exits 0.
  evidence: `pnpm --filter desktop typecheck` (`tsc --noEmit`) exited 0 and `pnpm --filter desktop lint` (`eslint .`) exited 0.
- [ ] `pnpm -r --if-present test` exits 0 across `web`, `desktop`, `mobile`, and `masarx-shared`.
- [ ] CI `test` job on the PR reports `success` on GitHub Actions.

## Evidence

- Root cause confirmed in `apps/desktop/src/main/__tests__/main.test.ts`: prior `startMainProcess()` tests left fire-and-forget `Updater.checkOnStartup()` promises in flight (awaiting `readVersionMarker` / `writeVersionMarker` on `tmpUserDataDir`). In `updates:check is rate-limited right after the startup check (spec 058)`, `vi.waitFor(() => expect(autoUpdater.checkForUpdates).toHaveBeenCalled())` could resolve on a prior test's `checkOnStartup()` call after `mockClear()`, before the current test's `Updater` stamped `lastCheckAt`, causing `checkFor()` to return `{ status: 'disabled' }`.
- Fix in `apps/desktop/src/main/__tests__/main.test.ts`: spy on `Updater.prototype.checkOnStartup` in `beforeAll` to track active startup-check promises in `pendingStartupChecks`, drain them in `afterEach`/`afterAll` via `drainStartupChecks()`, and await `drainStartupChecks()` + assert `expect((autoUpdater as any).checkForUpdates).toHaveBeenCalledTimes(1)` in the `updates:check` rate-limit test.
- `pnpm --filter desktop test` (5 consecutive runs in `C:/programming/WEB_Development/projects/masarx-wt/task-T-001`):
  - Run 1: exit 0 — `Test Files 6 passed | 1 skipped (7)`, `Tests 68 passed | 4 skipped (72)`, `main.test.ts (22 tests)`
  - Run 2: exit 0 — `Test Files 6 passed | 1 skipped (7)`, `Tests 68 passed | 4 skipped (72)`, `main.test.ts (22 tests)`
  - Run 3: exit 0 — `Test Files 6 passed | 1 skipped (7)`, `Tests 68 passed | 4 skipped (72)`, `main.test.ts (22 tests)`
  - Run 4: exit 0 — `Test Files 6 passed | 1 skipped (7)`, `Tests 68 passed | 4 skipped (72)`, `main.test.ts (22 tests)`
  - Run 5: exit 0 — `Test Files 6 passed | 1 skipped (7)`, `Tests 68 passed | 4 skipped (72)`, `main.test.ts (22 tests)`
- `pnpm --filter desktop test:coverage`: exit 0 — `68 passed | 4 skipped (72)`, overall v8 coverage 78.37% stmts / 75.16% branch / 73.46% funcs / 80.24% lines.
- `pnpm --filter desktop typecheck && pnpm --filter desktop lint`: exit 0.
- `pnpm -r --if-present test`: exited 1 on Windows in `masarx-shared` (`src/types/schemas/__tests__/unused-exports-guard.test.ts`: `'grep' is not recognized as an internal or external command, operable program or batch file.` -> `1 failed | 279 passed (280)`).
- Individual workspace test runs:
  - `pnpm --filter web test`: exit 0 — `107 passed (107)` files, `1215 passed (1215)` tests.
  - `pnpm --filter mobile test`: exit 0 — `16 passed (16)` files, `126 passed | 1 skipped (127)` tests.

## Rollback

Revert the test-isolation edit in `apps/desktop/src/main/__tests__/main.test.ts` via `git revert <commit>`.

## Open questions

- None.
