"use client";

import { useTranslations } from "next-intl";
import { Root as SwitchRoot, Thumb as SwitchThumb } from "@radix-ui/react-switch";
import { Clock, Zap } from "lucide-react";

interface ExtraAssetsSectionProps {
  showExtraAssets: boolean;
  isSaving: boolean;
  cooldownRemaining: number;
  dir: "rtl" | "ltr";
  onToggle: (enabled: boolean) => void;
}

/** Special settings card of the profile page (T-011b split): the
 * extra-assets switch with its post-toggle cooldown. Toggle persistence
 * lives in `useProfileEditor`; this component is presentational. */
export function ExtraAssetsSection({
  showExtraAssets,
  isSaving,
  cooldownRemaining,
  dir,
  onToggle,
}: ExtraAssetsSectionProps) {
  const t = useTranslations("profile");

  // Check if cooldown is active
  const isCooldownActive = cooldownRemaining > 0;

  // Format remaining time for display
  const formatCooldownTime = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return t("cooldownWithHours", { hours, minutes });
    return t("cooldownWithMinutes", { minutes });
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
          <span className="w-2 h-8 bg-red-600 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.5)]" />
          {t("specialSettings")}
        </h2>
      </div>
      <div className="group relative bg-slate-50 dark:bg-white/[0.02] p-4 sm:p-6 rounded-[2.5rem] border border-slate-100 dark:border-white/5 transition-all duration-300">
        <div className="flex flex-col gap-4 sm:gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
            <div className="flex items-start sm:items-center gap-3 sm:gap-5 min-w-0">
              <div className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 bg-red-600/10 dark:bg-red-600/20 rounded-2xl flex items-center justify-center shadow-inner">
                <Zap className="w-7 h-7 text-red-600" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight truncate">
                    {t("showExtraContent")}
                  </h3>
                </div>
                <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                  {t("extraContentDesc")}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3">
              {/* Cooldown indicator */}
              {isCooldownActive && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100/80 text-amber-800 ring-1 ring-amber-200/70 shadow-xs dark:bg-amber-900/25 dark:text-amber-200 dark:ring-amber-700/30">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-xs font-black tabular-nums">
                    {formatCooldownTime(cooldownRemaining)}
                  </span>
                </div>
              )}

              <SwitchRoot
                checked={showExtraAssets}
                onCheckedChange={onToggle}
                disabled={isSaving || isCooldownActive}
                dir={dir}
                className={`
                  group relative h-8 w-14 rounded-full outline-hidden
                  transition-all duration-300 ease-in-out
                  focus-visible:ring-2 focus-visible:ring-red-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-brand-navy
                  disabled:cursor-not-allowed disabled:opacity-50
                  ${
                    showExtraAssets
                      ? "bg-red-600 shadow-[0_0_16px_4px_rgba(220,38,38,0.35)]"
                      : "bg-slate-200 dark:bg-slate-700 shadow-inner"
                  }
                `}
              >
                <SwitchThumb
                  className={`
                    absolute top-1 h-6 w-6 rounded-full
                    transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                    will-change-[inset-inline-start]
                    [inset-inline-start:0.25rem]
                    data-[state=checked]:[inset-inline-start:calc(100%-1.5rem-0.25rem)]
                    data-[state=checked]:shadow-[0_0_8px_2px_rgba(220,38,38,0.5)]
                    ${
                      showExtraAssets
                        ? "bg-white scale-90"
                        : "bg-white shadow-md"
                    }
                    group-active:scale-75
                  `}
                />
              </SwitchRoot>
            </div>
          </div>
        </div>
        {/* Cooldown info */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <span className="font-bold">{t("note")}:</span>{" "}
            {t("cooldownNote")}
          </p>
        </div>
      </div>
    </section>
  );
}
