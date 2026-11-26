"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from '@/navigation';
import { User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { UpdateCheck } from "@/components/desktop/UpdateCheck";
import { supabase } from "@/lib/supabase";
import { useUserAcademic } from "@/hooks/useUserAcademic";

// Decomposed sections (T-011b split; behavior-preserving)
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { PersonalInfoSection } from "@/components/profile/PersonalInfoSection";
import { AcademicPathSection } from "@/components/profile/AcademicPathSection";
import { ExtraAssetsSection } from "@/components/profile/ExtraAssetsSection";
import { NotificationsSection } from "@/components/profile/NotificationsSection";
import { ActivityLogSection } from "@/components/profile/ActivityLogSection";
import { useProfileEditor } from "@/components/profile/useProfileEditor";
import { useAdminRoleRefresh } from "@/components/profile/useAdminRoleRefresh";

export default function ProfilePage() {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const t = useTranslations("profile");
  const commonT = useTranslations("common");
  const authT = useTranslations("auth");
  const router = useRouter();
  const dir = locale === "ar" ? "rtl" : "ltr";
  const {
    user,
    profile,
    isAdmin,
    loading: authLoading,
  } = useAuth();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const adminRole = user?.app_metadata?.role;
  const displayName = profile?.username || user?.user_metadata?.username || user?.email?.split("@")[0] || "";

  const {
    isEditing,
    setIsEditing,
    newDisplayName,
    setNewDisplayName,
    displayNameError,
    setDisplayNameError,
    isSaving,
    handleSaveDisplayName,
    handleCancelEdit,
    showExtraAssets,
    cooldownRemaining,
    handleToggleExtraAssets,
  } = useProfileEditor({ supabase, user, displayName });

  const { isRefreshingRole, refreshAdminStatus } = useAdminRoleRefresh({
    supabase,
    router,
  });

  const {
    academic,
    levels,
    departments,
    loading: academicLoading,
    optionsLoading,
  } = useUserAcademic();
  const { setUserAcademic } = useUserAcademic();

  if (!mounted || authLoading) {
    return (
      <div className="min-h-dvh-safe bg-white dark:bg-brand-navy flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-blue/20 border-t-brand-blue rounded-full animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 font-bold animate-pulse">
            {commonT("loading")}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-dvh-safe bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="text-center">
          <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {t("mustLogin")}
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            {t("loginPrompt")}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {authT("signIn")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`max-w-4xl mx-auto px-0 sm:px-6 lg:px-8 py-0 sm:py-8 ${locale === 'ar' ? 'text-right' : 'text-left'} overflow-x-hidden`}
      dir={dir}
    >
      <div className="modern-card overflow-hidden sm:rounded-3xl border-0 sm:border">
        {/* Header Section */}
        <ProfileHeader
          displayName={displayName}
          isAdmin={isAdmin}
          adminRole={adminRole}
          isRefreshingRole={isRefreshingRole}
          onRefreshRole={refreshAdminStatus}
        />

        {/* Main Content Area */}
        <div className="p-5 sm:p-10 space-y-10 bg-white dark:bg-brand-navy/30">
          {/* Personal Info Section */}
          <PersonalInfoSection
            email={user.email}
            displayName={displayName}
            isAdmin={isAdmin}
            adminRole={adminRole}
            isEditing={isEditing}
            newDisplayName={newDisplayName}
            setNewDisplayName={setNewDisplayName}
            displayNameError={displayNameError}
            setDisplayNameError={setDisplayNameError}
            isSaving={isSaving}
            onStartEdit={() => setIsEditing(true)}
            onSaveName={handleSaveDisplayName}
            onCancelEdit={handleCancelEdit}
          />

          {/* Academic Info Section */}
          <AcademicPathSection
            academic={academic}
            levels={levels}
            departments={departments}
            academicLoading={academicLoading}
            optionsLoading={optionsLoading}
            setUserAcademic={setUserAcademic}
          />

          {/* Special Settings Section */}
          {showExtraAssets && (
            <ExtraAssetsSection
              showExtraAssets={showExtraAssets}
              isSaving={isSaving}
              cooldownRemaining={cooldownRemaining}
              dir={dir}
              onToggle={handleToggleExtraAssets}
            />
          )}

          {/* Notifications Settings Section */}
          <NotificationsSection />

          {/* Activity Logs Section */}
          <ActivityLogSection
            createdAt={user.created_at}
            lastSignInAt={user.last_sign_in_at}
            locale={locale}
          />

          {/* Spec 058 — manual update check (desktop shell only; renders
              null in the browser). */}
          <UpdateCheck />

          {/* Footer Actions */}
          <div className="pt-10 flex flex-col sm:flex-row gap-4 border-t border-slate-100 dark:border-white/5">
            <button
              onClick={() => router.push("/")}
              className="w-full sm:w-auto px-12 py-4 bg-brand-blue text-white rounded-2xl font-black hover:bg-brand-sky shadow-xl shadow-brand-blue/25 transition-all duration-300 active:scale-95 text-center"
            >
              {t("backToHome")}
            </button>
            <button
              onClick={() => window.history.back()}
              className="w-full sm:w-auto px-12 py-4 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 rounded-2xl font-black hover:bg-slate-200 dark:hover:bg-white/10 transition-all duration-300 active:scale-95 text-center"
            >
              {t("back")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
