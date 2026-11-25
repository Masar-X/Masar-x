/**
 * Grandfathered baseline for the browser-Supabase import ratchet
 * (see the `no-restricted-imports` block in `eslint.config.mjs` and
 * `docs/ARCHITECTURE.md`).
 *
 * These 48 files import the browser Supabase client - the `@/lib/supabase`
 * singleton (`src/lib/supabase.ts`), the per-call `@/lib/supabase/client`
 * factory, or a relative spelling of either - from client pages,
 * components, contexts, hooks and libs. They predate the ratchet: a new
 * file importing the browser client fails `pnpm --filter web lint`
 * immediately, and removing an entry here re-flags that file.
 *
 * Burn-down notes:
 *   - `src/app/[locale]/profile/page.tsx` tracks as T-011b
 *   - `src/app/[locale]/courses/[courseId]/page.tsx` tracks as T-011c
 *   - the rest wait for their own burn-down cards.
 *
 * The baseline was computed by running ESLint itself with the rule enabled
 * (never by grepping). Paths are relative to `apps/web/`.
 */
export const browserSupabaseImportAllowlist = [
  // app (9)
  "src/app/[locale]/courses/[courseId]/page.tsx", // T-011c burn-down
  "src/app/[locale]/edit-summary/page.tsx",
  "src/app/[locale]/login/page.tsx",
  "src/app/[locale]/non-academic/[subject]/page.tsx",
  "src/app/[locale]/profile/page.tsx", // T-011b burn-down
  "src/app/[locale]/quizzes/_hooks/useQuizzesData.ts",
  "src/app/[locale]/reset-password/page.tsx",
  "src/app/[locale]/subjects/[subject]/page.tsx",
  "src/app/[locale]/summaries/[summaryId]/page.tsx",
  // components (8)
  "src/components/EnrollmentsTab.tsx",
  "src/components/HomeClient.tsx",
  "src/components/SemesterAdminControl.tsx",
  "src/components/SubjectsTab.tsx",
  "src/components/lectures/LectureSelect.tsx",
  "src/components/sidenav/AppNav.tsx",
  "src/components/subject/LectureContentModal.tsx",
  "src/components/waitlist/WaitlistSignup.tsx",
  // contexts (2)
  "src/contexts/AuthContext.tsx",
  "src/contexts/PlatformSettingsContext.tsx",
  // hooks (24)
  "src/hooks/trw/useRedeemAccessCode.ts",
  "src/hooks/trw/useTRWCategories.ts",
  "src/hooks/trw/useTRWCourseDetails.ts",
  "src/hooks/trw/useTRWCourses.ts",
  "src/hooks/trw/useTRWMembership.ts",
  "src/hooks/trw/useTRWProgress.ts",
  "src/hooks/useAcademicOptions.ts",
  "src/hooks/useAiChat.ts",
  "src/hooks/useAppeals.ts",
  "src/hooks/useConversations.ts",
  "src/hooks/useCourses.ts",
  "src/hooks/useEditSummary.ts",
  "src/hooks/useEnrollments.ts",
  "src/hooks/useLectureContent.ts",
  "src/hooks/useManageLectures.ts",
  "src/hooks/useNews.ts",
  "src/hooks/useNotifications.ts",
  "src/hooks/usePlatformSettings.ts",
  "src/hooks/useQuizzes.ts",
  "src/hooks/useReviews.ts",
  "src/hooks/useSubjects.ts",
  "src/hooks/useSummaries.ts",
  "src/hooks/useUserAcademic.ts",
  "src/hooks/useVideoRatings.ts",
  // lib (5)
  "src/lib/analytics.ts",
  "src/lib/analyticsHelpers.ts",
  "src/lib/cloudinary.ts",
  "src/lib/quiz.ts",
  "src/lib/student-agent/platformRetriever.ts",
];
