"use client";

import { useRouter } from '@/navigation';
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabase";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { Star, MessageSquare, Clock, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ReviewForm } from "@/components/reviews/ReviewForm";

// Decomposed components
import { CourseHero } from "@/components/courses/CourseHero";
import { CourseContent } from "@/components/courses/CourseContent";
import { ReviewSection } from "@/components/courses/ReviewSection";
import { SubscribeModal } from "@/components/courses/SubscribeModal";

import { useCourseDetail } from "./_hooks/useCourseDetail";

export default function CourseDetailPage() {
  const router = useRouter();
  const t = useTranslations("courseDetail.page");
  const tNav = useTranslations("nav");
  const assistantName = tNav("assistant");

  const {
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
  } = useCourseDetail(supabase);

  const renderActionButton = () => {
    const status = getEnrollmentStatus();
    if (!user)
      return (
        <Button onClick={() => router.push("/login")} className="w-full">
          {t("actions.loginToEnroll")}
        </Button>
      );
    switch (status) {
      case "active":
        return (
          <div className="space-y-3">
            <Button
              onClick={() => router.push("/ai-assistant")}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <MessageSquare className="w-4 h-4 ml-2" />
              {t("actions.startAi", { name: assistantName })}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowReviewForm(true)}
              className="w-full"
            >
              <Star className="w-4 h-4 ml-2" />
              {t("actions.reviewCourse")}
            </Button>
          </div>
        );
      case "pending":
        return (
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <Clock className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
            <p className="text-yellow-800 font-medium">{t("status.pending")}</p>
          </div>
        );
      case "rejected":
        return (
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <XCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
            <p className="text-red-800 font-medium">{t("status.rejected")}</p>
            <Button
              onClick={() => setShowSubscribeModal(true)}
              className="mt-3"
              variant="outline"
            >
              {t("actions.retry")}
            </Button>
          </div>
        );
      default:
        return (
          <Button
            onClick={() => setShowSubscribeModal(true)}
            className="w-full"
          >
            {t("actions.enroll")}
          </Button>
        );
    }
  };

  if (loading)
    return (
      <div className="min-h-dvh-safe bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );

  if (!course)
    return (
      <div className="min-h-dvh-safe bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {t("status.notFound")}
          </h1>
        </div>
      </div>
    );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl mx-auto p-6 space-y-6"
    >
      <CourseHero
        course={course}
        enrollmentStatus={getEnrollmentStatus()}
        renderActionButton={renderActionButton}
      />

      <CourseContent
        enrollmentStatus={getEnrollmentStatus()}
        isInstructor={isInstructor()}
        summaries={summaries}
        videos={videos}
        files={files}
        onOpenSummaryModal={(s) => {
          if (s) setEditingSummary(s);
          else setEditingSummary(null);
        }}
        onDeleteSummary={handleDeleteSummary}
        onOpenVideoModal={(v) => {
          if (v) setEditingVideo(v);
          else setEditingVideo(null);
        }}
        onDeleteVideo={handleDeleteVideo}
        onOpenFileModal={(f) => {
          if (f) setEditingFile(f);
          else setEditingFile(null);
        }}
        onDeleteFile={handleDeleteFile}
        onDownloadFile={(fileUrl) => {
          const { data } = supabase.storage
            .from("course-materials")
            .getPublicUrl(fileUrl);
          window.open(data.publicUrl, "_blank", "noopener,noreferrer");
        }}
      />

      <ReviewSection reviews={reviews} />

      <AnimatePresence>
        {showSubscribeModal && (
          <SubscribeModal
            paymentScreenshot={paymentScreenshot}
            uploading={uploadingScreenshot}
            onFileChange={setPaymentScreenshot}
            onConfirm={handleSubscribe}
            onClose={() => setShowSubscribeModal(false)}
          />
        )}
      </AnimatePresence>

      {showReviewForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md bg-white dark:bg-gray-900">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("actions.reviewCourse")}</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowReviewForm(false)}
              >
                <XCircle className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent>
              <ReviewForm
                user={user}
                onSubmit={handleReviewSubmit}
                onCancel={() => setShowReviewForm(false)}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </motion.div>
  );
}
