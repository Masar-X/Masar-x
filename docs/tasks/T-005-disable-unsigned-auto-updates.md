---
id: T-005
title: "Disable unsigned desktop auto-updates"
priority: P0
status: done
depends_on: []
touches:
  - "apps/desktop/electron-builder.yml"
  - "apps/desktop/src/main/updater.ts"
  - "apps/desktop/src/main/__tests__/updater.test.ts"
  - "apps/web/src/components/desktop/UpdateToast.tsx"
  - "packages/shared/src/messages/ar/desktopUpdates.json"
  - "packages/shared/src/messages/en/desktopUpdates.json"
owner_action: false
area: desktop
estimate: 0.5d
---

## Context

- [VERIFIED] `apps/desktop/electron-builder.yml:173-176` has Windows Authenticode signing (`certificateFile`, `certificatePassword`, `publisherName`, `verifyUpdateCodeSignature: true`) commented out, so Windows desktop installers ship unsigned.
- [VERIFIED] `apps/desktop/src/main/updater.ts:156-157` sets `this.au.autoDownload = true` and `this.au.autoInstallOnAppQuit = true` inside `checkOnStartup()`, automatically downloading and applying unsigned updates without explicit user action or code-signature verification.
- [VERIFIED] `apps/desktop/src/main/__tests__/updater.test.ts:95-96` initializes `autoUpdaterMock` with `autoDownload: false` and `autoInstallOnAppQuit: false`, and has no assertion checking what `checkOnStartup()` sets on those properties.
- [VERIFIED] Recent commit `01f3530` (spec 058) updated `apps/desktop/src/main/updater.ts:58-61,217-242` (`UpdateCheckResult` and `checkFor()`) and `apps/desktop/src/main/index.ts:456` (`updates:check`), leaving `checkOnStartup()` at lines `156-157` untouched.
- [VERIFIED] Existing notification UI already exists at `apps/web/src/components/desktop/UpdateToast.tsx:24-119` (mounted in `apps/web/src/components/AppProviders.tsx:48`, subscribed to `updates:available`); its `handleInstall` (`UpdateToast.tsx:51-57`) currently invokes `installAndRestart()` (which expects a downloaded update).
- [VERIFIED] `depends_on: []` — `touches` serializes this card against any other `apps/desktop/` cards (`T-001`).

## Goal

Prevent silent download and install-on-quit of unsigned desktop releases by setting `autoDownload = false` and `autoInstallOnAppQuit = false` in `Updater`, pin it with unit tests, and document the code-signing re-enablement follow-up.

## Non-goals

- Purchasing or configuring EV Authenticode / Apple Developer ID signing certificates (`apps/desktop/electron-builder.yml:165-182,228-236`).
- Building any new notification UI or changing `UpdateCheck.tsx` (`apps/web/src/components/desktop/UpdateCheck.tsx`).

## Steps

1. Update `apps/desktop/src/main/updater.ts:153-157` (and `checkOnStartup()` JSDoc at lines `143-146`) to set `this.au.autoDownload = false` and `this.au.autoInstallOnAppQuit = false` until signed builds (`verifyUpdateCodeSignature: true`) are enabled, with an explanatory comment referencing `apps/desktop/electron-builder.yml:173-176`.
2. Add a comment note in `apps/desktop/electron-builder.yml:165-177` linking `verifyUpdateCodeSignature: true` re-enablement to flipping `autoDownload` / `autoInstallOnAppQuit` in `apps/desktop/src/main/updater.ts` (and note `T-005` follow-up).
3. Owner decision for `updates:available`: only update the existing notification UI (`apps/web/src/components/desktop/UpdateToast.tsx:24-119`) to link to manual GitHub Releases (`Masar-X/Masar-x/releases/latest`) while `autoDownload = false` (if modifying `UpdateToast.tsx`, add it to `touches` or track as a tiny follow-up; do NOT build any new UI).
4. Add unit test assertions in `apps/desktop/src/main/__tests__/updater.test.ts` verifying `checkOnStartup()` explicitly sets `autoDownload = false` and `autoInstallOnAppQuit = false` (even if initially `true` on `autoUpdaterMock`).
5. Run desktop tests, typecheck, and ESLint.

## Acceptance criteria

<!-- Rule: `- [x]` is allowed ONLY when the very next line is `evidence: <command + real output>` (enforced by `pnpm tasks:lint`). -->

- [x] `pnpm --filter desktop test` exits 0 with new assertions verifying `autoUpdater.autoDownload === false` and `autoUpdater.autoInstallOnAppQuit === false` after `checkOnStartup()`.
  evidence: `pnpm --filter desktop test` in the task-T-005 worktree exited 0 — `Test Files 6 passed | 1 skipped (7)`, `Tests 69 passed | 4 skipped (73)`, duration 6.50s, EXIT=0; new case `checkOnStartup pins autoDownload/autoInstallOnAppQuit to false (T-005 unsigned releases)` passes (`updater.test.ts` now 16 tests; it seeds both flags `true` on `autoUpdaterMock`, runs `checkOnStartup()`, asserts both `false`).
- [x] `pnpm --filter desktop typecheck && pnpm --filter desktop lint` exits 0.
  evidence: `pnpm --filter desktop typecheck` (`tsc --noEmit`) EXIT=0 and `pnpm --filter desktop lint` (`eslint .`) EXIT=0 in the task-T-005 worktree (2026-11-25).
- [x] `apps/desktop/electron-builder.yml` includes a clear signing follow-up comment linking `verifyUpdateCodeSignature: true` to re-enabling `autoDownload` / `autoInstallOnAppQuit` in `apps/desktop/src/main/updater.ts`.
  evidence: T-005 comment block added directly under `# verifyUpdateCodeSignature: true` in the `win:` block (diff hunk `@@ -174,6 +174,14 @@ win:`): re-enable the signing block FIRST, then flip `autoDownload` / `autoInstallOnAppQuit` back to `true` in `updater.ts` (T-005 follow-up).

## Evidence

- `pnpm install --frozen-lockfile` completed in the worktree (`node_modules/.modules.yaml` present) before running the gates.
- `pnpm --filter desktop test`: EXIT=0 — `Test Files 6 passed | 1 skipped (7)`, `Tests 69 passed | 4 skipped (73)` (`updater.test.ts` 16/16 including the new T-005 pin assertion; `main.test.ts` 22/22 — the recently fixed async-drain assertions untouched).
- `pnpm --filter desktop typecheck`: EXIT=0 (`tsc --noEmit`). `pnpm --filter desktop lint`: EXIT=0 (`eslint .`).
- Extra gates for the step-3 files outside the original 3 `touches`: `pnpm --filter web typecheck` EXIT=0; shared suite `279 passed | 1 failed (280)` — the single failure is `src/types/schemas/__tests__/unused-exports-guard.test.ts` on `ProfileSchema`, which reproduces on the clean tree with this card's changes stashed (`CLEAN-TREE-EXIT=1`) and is already documented as a Windows environment failure of the same suite in T-001's evidence (`'grep' is not recognized...`); pre-existing, unrelated to this diff. The shared `namespaces-parity` per-key contract is inside the 279 passing.
- Card correction (audit): `touches` extended with `apps/web/src/components/desktop/UpdateToast.tsx` + `packages/shared/src/messages/{ar,en}/desktopUpdates.json` — step 3 explicitly sanctioned modifying the existing notification UI and adding it to `touches`; the key rename `install` → `downloadFromReleases` in both locales keeps the per-key ar/en parity contract.
- Not verified (no environment): packaged-app runtime behavior (no installer build/run) and the toast link click-through in a real Electron shell (UpdateToast has no unit/e2e coverage; the link is render-checked by web `tsc` only).

## Rollback

Revert the commit via `git revert <commit>` (restoring `autoDownload = true` and `autoInstallOnAppQuit = true` only if signed builds are active).

## Open questions

- None (owner confirmed: link `updates:available` to manual GitHub Releases only within existing notification UI; do not build new UI).
