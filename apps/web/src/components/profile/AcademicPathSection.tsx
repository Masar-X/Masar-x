"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import type {
  AcademicLevel,
  Department,
  UserAcademic,
} from "@/lib/academic-utils";

interface AcademicPathSectionProps {
  academic: UserAcademic;
  levels: AcademicLevel[];
  departments: Department[];
  academicLoading: boolean;
  optionsLoading: boolean;
  setUserAcademic: (
    next: UserAcademic,
    options?: { isProfileUpdate?: boolean },
  ) => Promise<{ success: boolean; message?: string }>;
}

/** Academic path card of the profile page (T-011b split): current path
 * summary plus the level/department/semester form. The form state lives
 * here; the page renders this section only for signed-in users and passes
 * the shared `useUserAcademic` data down as props. */
export function AcademicPathSection({
  academic,
  levels,
  departments,
  academicLoading,
  optionsLoading,
  setUserAcademic,
}: AcademicPathSectionProps) {
  const t = useTranslations("profile");
  const academicT = useTranslations("onboarding"); // Reusing onboarding for level/department translations
  const commonT = useTranslations("common");

  const [isSavingAcademic, setIsSavingAcademic] = useState(false);
  const [academicError, setAcademicError] = useState<string | null>(null);
  const [level, setLevel] = useState<number>(academic.level ?? 1);
  const [semester, setSemester] = useState<number>(academic.semester ?? 1);
  const [departmentId, setDepartmentId] = useState<string>(
    academic.department_id || "",
  );

  useEffect(() => {
    if (academic.level != null) setLevel(academic.level);
  }, [academic.level]);

  useEffect(() => {
    if (academic.semester != null) setSemester(academic.semester);
  }, [academic.semester]);

  useEffect(() => {
    if (academic.department_id != null) setDepartmentId(academic.department_id);
  }, [academic.department_id]);

  const handleSaveAcademic = async () => {
    setIsSavingAcademic(true);
    setAcademicError(null);
    try {
      const result = await setUserAcademic(
        {
          level,
          semester,
          department_id: departmentId || null,
        },
        { isProfileUpdate: true },
      );
      if (!result.success) {
        setAcademicError(result.message || t("academicUpdateError"));
        setTimeout(() => setAcademicError(null), 5000);
      } else {
        toast.success(t("academicUpdateSuccess"));
      }
    } catch {
      setAcademicError(t("academicUpdateError"));
      setTimeout(() => setAcademicError(null), 5000);
    } finally {
      setIsSavingAcademic(false);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
          <span className="w-2 h-8 bg-brand-blue rounded-full shadow-[0_0_15px_rgba(var(--brand-blue),0.5)]" />
          {t("academicPath")}
        </h2>
      </div>
      <div className="bg-slate-50 dark:bg-white/[0.02] p-7 rounded-[2.5rem] border border-slate-100 dark:border-white/5 group relative overflow-hidden">
        <div className="flex flex-col gap-8">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-brand-blue/10 rounded-2xl flex items-center justify-center text-2xl">
              🎓
            </div>
            <div>
              <p className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-1">
                {t("currentPath")}
              </p>
              <p className="font-black text-slate-900 dark:text-white text-xl tracking-tight">
                {academicLoading
                  ? commonT("loading")
                  : `${
                      levels.find((l) => l.level_number === level)
                        ?.name || t("notSpecified")
                    } • ${academicT("semesterLabel", { semester })}`}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr_0.8fr_auto] gap-4 items-end">
            <div className="space-y-2">
              <label
                htmlFor="profile-level"
                className="text-[10px] font-black text-slate-400 uppercase"
              >
                {academicT("academicLevel")}
              </label>
              <select
                id="profile-level"
                name="level"
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                className="w-full px-4 py-3 border-2 border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-brand-navy/50 font-bold outline-hidden disabled:opacity-50"
                disabled={optionsLoading}
              >
                {optionsLoading ? (
                  <option>{commonT("loading")}</option>
                ) : (
                  levels.map((l) => (
                    <option key={l.id} value={l.level_number ?? 0}>
                      {l.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="profile-department"
                className="text-[10px] font-black text-slate-400 uppercase"
              >
                {academicT("department")}
              </label>
              <select
                id="profile-department"
                name="departmentId"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-4 py-3 border-2 border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-brand-navy/50 font-bold outline-hidden disabled:opacity-50"
                disabled={optionsLoading}
              >
                <option value="">
                  {optionsLoading
                    ? commonT("loading")
                    : academicT("selectDepartment")}
                </option>
                {!optionsLoading &&
                  departments
                    .filter((d) => {
                      const selectedLevel = levels.find(
                        (l) => l.level_number === level,
                      );
                      return (
                        !d.academic_level_id ||
                        d.academic_level_id === selectedLevel?.id
                      );
                    })
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
              </select>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="profile-semester"
                className="text-[10px] font-black text-slate-400 uppercase"
              >
                {t("semester")}
              </label>
              <select
                id="profile-semester"
                name="semester"
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value))}
                className="w-full px-4 py-3 border-2 border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-brand-navy/50 font-bold outline-hidden"
              >
                <option value={1}>{t("semester1")}</option>
                <option value={2}>{t("semester2")}</option>
                <option value={3}>{t("semester3")}</option>
              </select>
            </div>
            <button
              onClick={handleSaveAcademic}
              disabled={isSavingAcademic}
              className="h-[52px] bg-brand-blue text-white px-8 rounded-2xl font-black hover:bg-brand-sky active:scale-95 transition-all"
            >
              {isSavingAcademic ? (
                <RefreshCw className="animate-spin w-5 h-5" />
              ) : (
                <Save className="w-5 h-5" />
              )}
            </button>
          </div>
          {academicError && (
            <p className="text-red-500 text-sm font-bold">
              {academicError}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
