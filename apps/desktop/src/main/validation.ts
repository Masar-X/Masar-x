// Desktop-pro checklist T3 — validate renderer-supplied input at the IPC
// boundary. `updates:skip` was the last unchecked renderer-controlled input:
// its version argument used to pass straight through to electron-updater's
// internal skipUpdateCallback. Pure type-guard by design — logging and
// rejection live at the call site (main handler), so this module stays
// trivially unit-testable.

const UPDATE_VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
const UPDATE_VERSION_MAX_LENGTH = 64;

/**
 * Accepts only well-formed release versions (`MAJOR.MINOR.PATCH`, optionally
 * followed by a prerelease suffix like `-test.1` — matches the repo's
 * prerelease tagging convention, cf. `v0.6.0-test.1`).
 */
export function isValidUpdateVersion(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= UPDATE_VERSION_MAX_LENGTH &&
    UPDATE_VERSION_PATTERN.test(value)
  );
}
