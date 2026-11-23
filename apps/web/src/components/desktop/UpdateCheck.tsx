"use client";

/**
 * UpdateCheck — desktop-only "Check for updates" section (spec 058).
 *
 * `Updater.checkFor()` was dead code until spec 058: rate-limited and
 * gated, but with no IPC channel and no UI. This is the renderer surface:
 * a button + inline truthful result, mounted on the profile route (the
 * only existing settings-like surface — there is no desktop settings
 * panel; UpdateToast renders null when idle so it cannot host a
 * persistent action).
 *
 * `checking` is the in-flight UI state (button disabled while the invoke
 * is in flight), deliberately NOT a bridge status — the bridge resolves
 * with a truthful `DesktopUpdateCheckStatus` instead. Renders null
 * outside the Electron shell.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DesktopUpdateCheckResult } from "masarx-shared/types/desktop-bridge";

import { useIsDesktopRuntime } from "@/lib/desktop/useIsDesktopRuntime";
import { getDesktopBridge } from "@/lib/desktop/runtime";

export function UpdateCheck(): React.JSX.Element | null {
  const t = useTranslations("desktopUpdates");
  const isDesktop = useIsDesktopRuntime();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<DesktopUpdateCheckResult | null>(null);

  if (!isDesktop) return null;

  const handleCheck = (): void => {
    if (checking) return;
    setChecking(true);
    setResult(null);
    getDesktopBridge()
      ?.updates?.check()
      .then((res) => setResult(res))
      .catch(() => setResult({ status: "error" }))
      .finally(() => setChecking(false));
  };

  const resultText = (): string | null => {
    if (!result) return null;
    switch (result.status) {
      case "up-to-date":
        return t("upToDate");
      case "available":
        return t("versionAvailable", { version: result.version ?? "" });
      case "rate-limited":
        return t("rateLimited");
      case "disabled":
        return t("checksDisabled");
      case "error":
        return t("checkFailed");
      default:
        return null;
    }
  };

  return (
    <section aria-label={t("checkForUpdates")} className="mt-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          className="px-5 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          {checking ? t("checking") : t("checkForUpdates")}
        </button>
        {resultText() && (
          <p role="status" aria-live="polite" className="text-sm text-slate-600 dark:text-slate-300">
            {resultText()}
          </p>
        )}
      </div>
    </section>
  );
}
