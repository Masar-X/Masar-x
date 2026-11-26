"use client";

import { useTranslations } from "next-intl";
import { RefreshCw, Shield, User } from "lucide-react";
import { AdminProfileImage } from "@/components/AdminProfileImage";

interface ProfileHeaderProps {
  displayName: string;
  isAdmin: boolean;
  adminRole?: string;
  isRefreshingRole: boolean;
  onRefreshRole: () => void;
}

/** Gradient identity header of the profile page (T-011b split): avatar,
 * display name, role badge and the admin-role refresh control. */
export function ProfileHeader({
  displayName,
  isAdmin,
  adminRole,
  isRefreshingRole,
  onRefreshRole,
}: ProfileHeaderProps) {
  const t = useTranslations("profile");

  return (
    <div className="bg-linear-to-br from-brand-navy to-brand-blue px-6 sm:px-10 py-12 sm:py-16 text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl animate-pulse" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-brand-sky/10 rounded-full -ml-24 -mb-24 blur-2xl" />

      <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
        <div className="relative group shrink-0">
          <div className="absolute -inset-1 bg-linear-to-r from-brand-sky to-white/20 rounded-full blur-sm opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
          <AdminProfileImage
            size="xl"
            className="bg-white/10 backdrop-blur-md border-4 border-white/20 shadow-2xl relative"
            editable={true}
          />
        </div>
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight drop-shadow-xs truncate">
            {displayName}
          </h1>
          <div className="flex items-center justify-center sm:justify-start gap-3">
            <div className="px-4 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-full flex items-center gap-2">
              {isAdmin ? (
                <Shield className="w-4 h-4 text-brand-sky" />
              ) : (
                <User className="w-4 h-4 text-brand-sky" />
              )}
              <span className="text-sm font-bold tracking-wide">
                {isAdmin
                  ? adminRole === "doctor"
                    ? t("adminDoctor")
                    : adminRole === "student"
                      ? t("adminStudent")
                      : t("admin")
                  : t("user")}
              </span>
            </div>
            <button
              onClick={onRefreshRole}
              disabled={isRefreshingRole}
              className="p-2 hover:bg-white/20 rounded-xl transition-all active:scale-90 duration-300 disabled:opacity-60 bg-white/5 border border-white/10 shadow-xs"
              title={t("refreshRole")}
            >
              <RefreshCw
                className={`w-4 h-4 text-white ${isRefreshingRole ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
