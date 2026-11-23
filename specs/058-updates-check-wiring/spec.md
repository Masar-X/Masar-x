# Spec 058: Wire "Check for updates" end-to-end (kill the dead `Updater.checkFor`)

> Status: Owner-directed execution 2026-11-23 (desktop-pro checklist T4 — `sandbox/desktop-pro-checklist-2026-11-22/CHECKLIST.md`, correction-log C2). Spec approved by the owner via the T4 plan (2026-11-23).
> Numbering: derived from disk — `specs/` ends at `057-shadcn-tokens`; next free number = 058.
> Depends on: T1 (origin-blob re-verification, done), T2 (desktop lint gate, PR #305), T3 (`updates:skip` validation, PR #306).

## 1. Context & problem statement

`Updater.checkFor()` (`apps/desktop/src/main/updater.ts:205-221`) is a complete, rate-limited (1 h), dev/portable-gated manual check — and it is **dead code**: no IPC channel, no bridge contract entry, no renderer surface. Verified twice: the T1 audit grep (`checkFor` hits `updater.ts` only) and the T4 scoping pass. Desktop users depend purely on the startup check; there is no "Check for updates" action anywhere in the UI.

The update chain already has a working half: `bootUpdater` broadcasts `updates:available` / `updates:error`, `UpdateToast` renders both, and `updates:installAndRestart` / `updates:skip` are wired. Only the manual check is missing.

**Locked design decisions (owner-approved plan, 2026-11-23):**
- Statuses are **truthful**: `'disabled' | 'rate-limited' | 'up-to-date' | 'available' | 'error'`. `rate-limited` replaces the kickoff's suggested `checking` (that's a UI spinner state while the invoke is in flight, not a result); `checking` is dropped from the result contract for the same reason.
- `checkFor()` stops being fire-and-forget: it awaits `au.checkForUpdates()` and maps the resolved `UpdateCheckResult` (`isUpdateAvailable` + `updateInfo.version` — semantics verified against the installed electron-updater 6.8.11 typings, `node_modules/electron-updater/out/types.d.ts:26-33`; `null` resolve = updater inactive → `'disabled'`).
- Renderer surface = a desktop-runtime-gated section on the **profile route** (no desktop settings panel exists; `UpdateToast` renders null when idle, so it cannot host a persistent action).

## 2. Architecture & design

### 2.1 Shared contract (`packages/shared/src/types/desktop-bridge.ts`)

- New exported type:
  ```ts
  export type DesktopUpdateCheckStatus =
    | 'disabled' | 'rate-limited' | 'up-to-date' | 'available' | 'error';
  export interface DesktopUpdateCheckResult {
    status: DesktopUpdateCheckStatus;
    /** Present when status === 'available'. */
    version?: string;
  }
  ```
- `DesktopUpdatesBridge` gains `check: () => Promise<DesktopUpdateCheckResult>`.
- Canonical literal `masarxDesktopApi.updates.check` invokes `'updates:check'` with the established fallback pattern: `?? Promise.resolve({ status: 'disabled' })` (non-electron/test contexts report honestly rather than throwing).
- Header comment channel inventory (L22-26) gains `updates:check`.

### 2.2 Updater rework (`apps/desktop/src/main/updater.ts`)

- New exported `UpdateCheckResult` interface mirroring the shared shape (desktop keeps its own literal; the bridge mirrors it as spec-015 does today for `DesktopUpdateAvailableInfo`).
- `checkFor(): Promise<UpdateCheckResult>`:
  - `!isAutoUpdateEnabled()` → `{ status: 'disabled' }` (dev/portable, unchanged gate).
  - Rate-limit window active → `{ status: 'rate-limited' }` (the 1 h default and `checkForRateLimitMs` option are unchanged).
  - `await this.au.checkForUpdates()` → `result.isUpdateAvailable` → `{ status: 'available', version: result.updateInfo.version }`; otherwise `{ status: 'up-to-date' }`.
  - Catch → `{ status: 'error' }` (warn logged, as today).
  - `lastCheckAt` still stamped before the await; `checkOnStartup()` untouched; the `updates:available` broadcast continues to fire for the `available` case (toast + inline result may both appear — accepted).

### 2.3 Main handler + preload

- `index.ts` (after the `updates:skip` handler): `ipcMain.handle('updates:check', () => updater.checkFor())`.
- `preload.ts`: sibling `check` method inside `updates: { … }` — `ipcRenderer.invoke('updates:check')`. The preload file is `as const satisfies typeof masarxDesktopApi`, so the shared-literal change forces this at compile time.

### 2.4 Renderer surface (`apps/web`)

- New `apps/web/src/components/desktop/UpdateCheck.tsx` ("use client", sibling style to `UpdateToast`):
  - Renders `null` unless `useIsDesktopRuntime()` and `getDesktopBridge()?.updates` are present (invisible in the browser).
  - "Check for updates" button → `updates.check()`; inline result text per status: `upToDate`, `versionAvailable` `{version}`, `rateLimited`, `checksDisabled`, `checkFailed`; `checking` shown while the invoke is in flight (button disabled).
- Mounted in `apps/web/src/app/[locale]/profile/page.tsx` as a desktop-gated section (zero visual change for web users).
- i18n (I3): new keys in `packages/shared/src/messages/{ar,en}/desktopUpdates.json` (namespace already registered in `MESSAGE_LOADERS` — no registration change): `checkForUpdates`, `checking`, `upToDate`, `versionAvailable` (`{version}`), `rateLimited`, `checksDisabled`, `checkFailed`. ar/en shape parity enforced by the existing spec-040 parity test.

### 2.5 Test surface

- `updater.test.ts`: new rate-limit test (inject small `checkForRateLimitMs`; immediate second call → `{ status: 'rate-limited' }`); the two disabled-path tests updated from `.toBeNull()` to the new shape; new available/up-to-date mapping tests via the `autoUpdaterOverride` mock.
- `main.test.ts` (T017 describe): capture `updates:check` handler; assert status mapping through the mocked electron-updater surface.
- `desktop-bridge-fallbacks.test.ts`: forwards-check for the `updates:check` channel (existing per-channel pattern).
- Web e2e stubs (`sidenav.spec.ts`, `titlebar-border.spec.ts`): `check: async () => ({ status: 'disabled' })` keeps the hand-mirrored stub in sync with preload.

## 3. Non-goals

- No download-progress UI (checklist T7, separate spec).
- No tray/menu item hosting the action (T8 owner gate); the profile section is the single surface.
- No changes to startup-check semantics, trial/rollback logic, or the `updates:skip` contract (spec-058 rides on T3's validated handler).

## 4. Verification (done when)

- `grep -rn "updates:check"` hits: bridge contract + preload + `index.ts` + renderer (UpdateCheck) + both e2e stubs.
- Desktop vitest green incl. the new rate-limit + status-mapping tests; shared vitest green (fallbacks + parity); desktop `typecheck`/`lint` green (T2 gate); web `typecheck`/`lint` green; targeted e2e (`sidenav`, `titlebar-border`) green.
- PR merged with CI green (protected flow).
