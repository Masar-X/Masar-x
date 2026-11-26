"use client";

import { useTranslations } from "next-intl";
import { formatDate } from "masarx-shared/format";

interface ActivityLogSectionProps {
  createdAt: string;
  lastSignInAt?: string;
  locale: string;
}

/** Activity log tiles of the profile page (T-011b split): join date and
 * last sign-in, locale-aware formatting. */
export function ActivityLogSection({
  createdAt,
  lastSignInAt,
  locale,
}: ActivityLogSectionProps) {
  const t = useTranslations("profile");

  return (
    <section>
      <h2 className="text-xl font-black text-slate-900 dark:text-white mb-6 flex items-center gap-3">
        <span className="w-2 h-8 bg-brand-blue rounded-full shadow-[0_0_15px_rgba(var(--brand-blue),0.5)]" />
        {t("activityLog")}
      </h2>
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="p-7 bg-slate-50 dark:bg-white/[0.02] rounded-[2.5rem] border border-slate-100 dark:border-white/5">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
            {t("joinDate")}
          </p>
          <p className="font-black text-slate-900 dark:text-white text-xl tracking-tight">
            {createdAt
              ? formatDate(createdAt, {
                  locale: locale === "ar" ? "ar-EG" : "en-US",
                  month: "long",
                })
              : t("notSpecified")}
          </p>
        </div>
        <div className="p-7 bg-slate-50 dark:bg-white/[0.02] rounded-[2.5rem] border border-slate-100 dark:border-white/5">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
            {t("lastActivity")}
          </p>
          <p className="font-black text-slate-900 dark:text-white text-xl tracking-tight">
            {lastSignInAt
              ? formatDate(lastSignInAt, {
                  locale: locale === "ar" ? "ar-EG" : "en-US",
                  month: "long",
                  withTime: true,
                },
                )
              : t("notSpecified")}
          </p>
        </div>
      </div>
    </section>
  );
}
