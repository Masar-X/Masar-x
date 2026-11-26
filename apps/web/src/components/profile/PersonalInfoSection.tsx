"use client";

import { useTranslations } from "next-intl";
import { Edit3, Mail, Save, Shield, User, X } from "lucide-react";

interface PersonalInfoSectionProps {
  email?: string;
  displayName: string;
  isAdmin: boolean;
  adminRole?: string;
  isEditing: boolean;
  newDisplayName: string;
  setNewDisplayName: (value: string) => void;
  displayNameError: string | null;
  setDisplayNameError: (error: string | null) => void;
  isSaving: boolean;
  onStartEdit: () => void;
  onSaveName: () => void;
  onCancelEdit: () => void;
}

/** Personal info card of the profile page (T-011b split): display-name
 * edit form plus the email / account-type tiles. Editing state lives in
 * `useProfileEditor`; this component is presentational. */
export function PersonalInfoSection({
  email,
  displayName,
  isAdmin,
  adminRole,
  isEditing,
  newDisplayName,
  setNewDisplayName,
  displayNameError,
  setDisplayNameError,
  isSaving,
  onStartEdit,
  onSaveName,
  onCancelEdit,
}: PersonalInfoSectionProps) {
  const t = useTranslations("profile");
  const authT = useTranslations("auth");

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
          <span className="w-2 h-8 bg-brand-blue rounded-full shadow-[0_0_15px_rgba(var(--brand-blue),0.5)]" />
          {t("personalInfo")}
        </h2>
      </div>
      <div className="grid gap-5">
        <div className="group relative bg-slate-50 dark:bg-white/[0.02] p-6 rounded-[2.5rem] border border-slate-100 dark:border-white/5 transition-all duration-300 hover:shadow-xl hover:shadow-brand-blue/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-brand-blue/10 dark:bg-brand-blue/20 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-500">
                <User className="w-7 h-7 text-brand-blue" />
              </div>
              <div className="flex-1">
                <label
                  htmlFor="profile-display-name"
                  className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-1 block"
                >
                  {t("username")}
                </label>
                {isEditing ? (
                  <div className="relative mt-2">
                    <input
                      id="profile-display-name"
                      name="displayName"
                      aria-invalid={displayNameError ? true : undefined}
                      aria-describedby={
                        displayNameError
                          ? "profile-display-name-error"
                          : undefined
                      }
                      value={newDisplayName}
                      onChange={(e) => {
                        setNewDisplayName(e.target.value);
                        if (displayNameError) setDisplayNameError(null);
                      }}
                      dir="auto"
                      className="w-full px-5 py-3 border-2 border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-brand-navy/50 text-slate-900 dark:text-white font-bold focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue outline-hidden transition-all text-lg"
                      maxLength={50}
                      autoFocus
                    />
                  </div>
                ) : (
                  <p className="font-black text-slate-900 dark:text-white text-xl tracking-tight">
                    {displayName || t("notSpecified")}
                  </p>
                )}
                {displayNameError && (
                  <p
                    id="profile-display-name-error"
                    role="alert"
                    className="mt-2 text-sm font-bold text-red-500"
                  >
                    {displayNameError}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end pt-2 sm:pt-0">
              {isEditing ? (
                <div className="flex gap-3">
                  <button
                    onClick={onSaveName}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Save className="w-5 h-5" />
                    <span>{t("save")}</span>
                  </button>
                  <button
                    onClick={onCancelEdit}
                    className="flex items-center gap-2 px-6 py-3 bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 rounded-2xl font-bold transition-all active:scale-95"
                  >
                    <X className="w-5 h-5" />
                    <span>{t("cancel")}</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={onStartEdit}
                  className="flex items-center gap-2 px-6 py-3 bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue rounded-2xl font-bold hover:bg-brand-blue hover:text-white transition-all duration-300"
                >
                  <Edit3 className="w-5 h-5" />
                  <span>{t("editName")}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <div className="bg-slate-50 dark:bg-white/[0.02] p-6 rounded-[2.5rem] border border-slate-100 dark:border-white/5 flex items-center gap-5">
            <div className="w-14 h-14 bg-brand-orange/10 dark:bg-brand-orange/20 rounded-2xl flex items-center justify-center">
              <Mail className="w-7 h-7 text-brand-orange" />
            </div>
            <div>
              <p className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-1">
                {authT("email")}
              </p>
              <p className="font-bold text-slate-900 dark:text-white text-lg break-all">
                {email}
              </p>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-white/[0.02] p-6 rounded-[2.5rem] border border-slate-100 dark:border-white/5 flex items-center gap-5">
            <div className="w-14 h-14 bg-brand-blue/10 dark:bg-brand-blue/20 rounded-2xl flex items-center justify-center">
              <Shield className="w-7 h-7 text-brand-blue" />
            </div>
            <div>
              <p className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-1">
                {t("accountType")}
              </p>
              <p className="font-bold text-slate-900 dark:text-white text-lg">
                {isAdmin
                  ? adminRole === "doctor"
                    ? t("adminDoctor")
                    : adminRole === "student"
                      ? t("adminStudent")
                      : t("admin")
                  : t("user")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
