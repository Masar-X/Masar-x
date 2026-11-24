---
id: T-001
title: "Fix failing desktop test and green CI test job"
priority: P0
status: todo
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

- [ ] `pnpm --filter desktop test` passes 100% across 5 consecutive runs with 0 failures in `apps/desktop/src/main/__tests__/main.test.ts`.
- [ ] `pnpm --filter desktop typecheck && pnpm --filter desktop lint` exits 0.
- [ ] `pnpm -r --if-present test` exits 0 across `web`, `desktop`, `mobile`, and `masarx-shared`.
- [ ] CI `test` job on the PR reports `success` on GitHub Actions.

## Evidence

## Rollback

Revert the test-isolation edit in `apps/desktop/src/main/__tests__/main.test.ts` via `git revert <commit>`.

## Open questions

- None.
