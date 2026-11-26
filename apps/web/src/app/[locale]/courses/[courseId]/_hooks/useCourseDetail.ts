"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import type { SupabaseClient } from "masarx-shared/supabase";
import { toast } from "sonner";
import { confirmToast } from "@/lib/confirmToast";
import { useReviews } from "@/hooks/useReviews";

const getErrorMessage = (err: unknown): string | null => {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    return typeof msg === "string" ? msg : null;
  }
  return null;
};

interface Course {
  id: string;
  title: string;
  description: string;
  instructor_id: string;
  price: number;
  is_published: boolean;
  created_at: string;
  instructor_name?: string;
}

type CourseRow = Course & {
  profiles?: {
    display_name?: string | null;
  } | null;
};

type ReviewDetailsRow = {
  id: string;
  rating: number;
  comment?: string | null;
  created_at: string;
  full_name?: string | null;
  username?: string | null;
};

interface Enrollment {
  id: string;
  status: "pending" | "active" | "rejected";
  payment_screenshot_url?: string;
  created_at: string;
}

interface Review {
  id: string;
  rating: number;
  content?: string;
  created_at: string;
  student_name?: string;
}

interface CourseSummary {
  id: string;
  title: string;
  content: string;
  order_index: number;
  created_at: string;
}

interface CourseVideo {
  id: string;
  title: string;
  description?: string;
  video_url: string;
  language: "ar" | "en";
  duration?: number;
  order_index: number;
  created_at: string;
}

interface CourseFile {
  id: string;
  title: string;
  description?: string;
  file_url: string;
  file_type: string;
  file_size?: number;
  order_index: number;
  created_at: string;
}

/**
 * Course-detail data hook for `courses/[courseId]/page.tsx`: the course,
 * enrollment, review, summary/video/file state plus the publication-gated
 * fetch and the review/enrollment/delete handlers. The page stays a thin
 * view on top of this.
 *
 * The browser Supabase client is passed in by the page (which keeps its
 * grandfathered `@/lib/supabase` import) instead of imported here — the
 * T-009 ratchet fails lint for any new browser-client importer.
 */
export function useCourseDetail(supabase: SupabaseClient) {
  const params = useParams();
  const courseId = params?.courseId as string;
  const { user } = useAuth();
  const adminRole = user?.app_metadata?.role;
  const t = useTranslations("courseDetail.page");
  const tCommon = useTranslations("common");

  const [course, setCourse] = useState<Course | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summaries, setSummaries] = useState<CourseSummary[]>([]);
  const [videos, setVideos] = useState<CourseVideo[]>([]);
  const [files, setFiles] = useState<CourseFile[]>([]);
  const [loading, setLoading] = useState(true);

  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);

  const [showReviewForm, setShowReviewForm] = useState(false);

  const [, setEditingSummary] = useState<CourseSummary | null>(null);
  const [, setEditingVideo] = useState<CourseVideo | null>(null);
  const [, setEditingFile] = useState<CourseFile | null>(null);

  const isInstructor = () => {
    if (!user || !course) return false;
    return user.id === course.instructor_id || adminRole === "doctor";
  };

  const fetchCourseData = useCallback(async () => {
    if (!courseId) return;
    try {
      setLoading(true);
      const { data: courseData, error: courseError } = await supabase
        .from("courses")
        .select("*, profiles:instructor_id (display_name)")
        .eq("id", courseId)
        .single();

      if (courseError) throw courseError;

      if (courseData) {
        const typedCourseData = courseData as CourseRow;
        const isInstructorUser = user && user.id === courseData.instructor_id;
        const isDoctorAdmin = adminRole === "doctor";
        if (!courseData.is_published && !isInstructorUser && !isDoctorAdmin) {
          throw new Error("Course is not published");
        }

        setCourse({
          ...typedCourseData,
          instructor_name: typedCourseData.profiles?.display_name || t("fallback.instructor"),
        });

        // Spec 034 Track E (audit QUERY-2): the five follow-up reads are
        // independent of each other (only the course fetch gated them via
        // the publication check) — one round-trip instead of five serial
        // awaits.
        const [enrollmentRes, reviewsRes, summariesRes, videosRes, filesRes] =
          await Promise.all([
            user
              ? supabase
                  .from("enrollments")
                  .select("*")
                  .eq("student_id", user.id)
                  .eq("course_id", courseId)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
            supabase
              .from("review_details")
              .select("id,rating,comment,created_at,full_name,username")
              .eq("course_id", courseId)
              .order("created_at", { ascending: false }),
            supabase
              .from("course_summaries")
              .select("*")
              .eq("course_id", courseId)
              .order("order_index", { ascending: true }),
            supabase
              .from("course_videos")
              .select("*")
              .eq("course_id", courseId)
              .order("order_index", { ascending: true }),
            supabase
              .from("course_files")
              .select("*")
              .eq("course_id", courseId)
              .order("order_index", { ascending: true }),
          ]);

        setEnrollment(enrollmentRes.data);

        if (reviewsRes.data) {
          setReviews(
            (reviewsRes.data as ReviewDetailsRow[]).map((review) => ({
              id: review.id,
              rating: review.rating,
              content: review.comment || undefined,
              created_at: review.created_at,
              student_name: review.full_name || review.username || t("fallback.student"),
            })),
          );
        }

        if (summariesRes.data) setSummaries(summariesRes.data);
        if (videosRes.data) setVideos(videosRes.data);
        if (filesRes.data) setFiles(filesRes.data);
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || t("toasts.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [courseId, user, adminRole, t, supabase]);

  useEffect(() => {
    if (courseId) fetchCourseData();
  }, [courseId, fetchCourseData]);

  const { addReview } = useReviews(courseId, "course");

  const handleReviewSubmit = async (content: string, rating: number) => {
    if (!user) return;
    try {
      await addReview({
        course_id: courseId,
        user_id: user.id,
        rating,
        // The real column is `content` (the old hand-written type said
        // `comment`, which PostgREST rejects — spec 031 truthful types).
        content,
      });
      toast.success(t("toasts.reviewAdded"));
      setShowReviewForm(false);
      fetchCourseData();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || t("toasts.reviewFailed"));
    }
  };

  const handleSubscribe = async () => {
    if (!user || !course || !paymentScreenshot) return;
    try {
      setUploadingScreenshot(true);
      const fileExt = paymentScreenshot.name.split(".").pop();
      const fileName = `${user.id}/${course.id}/${Date.now()}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("payment-proofs")
        .upload(fileName, paymentScreenshot);
      if (uploadError) throw uploadError;

      // Upsert so a previously rejected/expired application can re-apply
      // under UNIQUE(student_id, course_id) (audit H20/H21). The UPDATE
      // branch is gated server-side by the reapply RLS policy in migration
      // 018 — an active enrollment can never be overwritten this way.
      const { error: enrollmentError } = await supabase
        .from("enrollments")
        .upsert(
          {
            student_id: user.id,
            course_id: course.id,
            payment_screenshot_url: uploadData.path,
            status: "pending",
          },
          { onConflict: "student_id,course_id" },
        );
      if (enrollmentError) throw enrollmentError;

      toast.success(t("toasts.enrollmentSent"));
      setShowSubscribeModal(false);
      setPaymentScreenshot(null);
      fetchCourseData();
    } catch {
      toast.error(t("toasts.enrollmentFailed"));
    } finally {
      setUploadingScreenshot(false);
    }
  };

  const handleDeleteSummary = async (summaryId: string) => {
    const confirmed = await confirmToast(t("toasts.confirmDelete", { type: t("deleteTypes.summary") }), {
      confirmLabel: tCommon("confirm"),
      cancelLabel: tCommon("cancel"),
    });
    if (!confirmed) return;
    try {
      const { error } = await supabase
        .from("course_summaries")
        .delete()
        .eq("id", summaryId);
      if (error) throw error;
      toast.success(t("toasts.deleted", { type: t("deleteTypes.summary") }));
      fetchCourseData();
    } catch {
      toast.error(t("toasts.deleteFailed", { type: t("deleteTypes.summary") }));
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    const confirmed = await confirmToast(t("toasts.confirmDelete", { type: t("deleteTypes.video") }), {
      confirmLabel: tCommon("confirm"),
      cancelLabel: tCommon("cancel"),
    });
    if (!confirmed) return;
    try {
      const { error } = await supabase
        .from("course_videos")
        .delete()
        .eq("id", videoId);
      if (error) throw error;
      toast.success(t("toasts.deleted", { type: t("deleteTypes.video") }));
      fetchCourseData();
    } catch {
      toast.error(t("toasts.deleteFailed", { type: t("deleteTypes.video") }));
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    const confirmed = await confirmToast(t("toasts.confirmDelete", { type: t("deleteTypes.file") }), {
      confirmLabel: tCommon("confirm"),
      cancelLabel: tCommon("cancel"),
    });
    if (!confirmed) return;
    try {
      const { error = null } = await supabase
        .from("course_files")
        .delete()
        .eq("id", fileId);
      if (error) throw error;
      toast.success(t("toasts.deleted", { type: t("deleteTypes.file") }));
      fetchCourseData();
    } catch {
      toast.error(t("toasts.deleteFailed", { type: t("deleteTypes.file") }));
    }
  };

  const getEnrollmentStatus = () => {
    if (!user || !enrollment) return "not_enrolled";
    return enrollment.status;
  };

  return {
    user,
    course,
    loading,
    reviews,
    summaries,
    videos,
    files,
    isInstructor,
    getEnrollmentStatus,
    showSubscribeModal,
    setShowSubscribeModal,
    paymentScreenshot,
    setPaymentScreenshot,
    uploadingScreenshot,
    handleSubscribe,
    showReviewForm,
    setShowReviewForm,
    handleReviewSubmit,
    setEditingSummary,
    setEditingVideo,
    setEditingFile,
    handleDeleteSummary,
    handleDeleteVideo,
    handleDeleteFile,
  };
}
