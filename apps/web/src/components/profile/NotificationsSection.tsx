"use client";

import { useTranslations } from "next-intl";
import { NotificationSettings } from "@/components/NotificationManager";

/** Notification preferences card of the profile page (T-011b split). The
 * settings UI itself lives in `NotificationManager`. */
export function NotificationsSection() {
  const t = useTranslations("profile");

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
          <span className="w-2 h-8 bg-brand-orange rounded-full shadow-[0_0_15px_rgba(var(--brand-orange),0.5)]" />
          {t("notificationSettings")}
        </h2>
      </div>
      <div className="bg-slate-50 dark:bg-white/[0.02] p-6 sm:p-10 rounded-[3rem] border border-slate-100 dark:border-white/5">
        <NotificationSettings />
      </div>
    </section>
  );
}
