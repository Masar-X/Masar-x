"use client";

import { useTranslations } from "next-intl";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

interface SubscribeModalProps {
  paymentScreenshot: File | null;
  uploading: boolean;
  onFileChange: (file: File | null) => void;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Enrollment/payment modal for `courses/[courseId]`: the student picks a
 * payment screenshot and applies. The upload + enrollment upsert lives in
 * `useCourseDetail` (T-011c split); the file state stays with the hook so a
 * cancelled modal keeps its pending selection, as before.
 */
export function SubscribeModal({
  paymentScreenshot,
  uploading,
  onFileChange,
  onConfirm,
  onClose,
}: SubscribeModalProps) {
  const t = useTranslations("courseDetail.page");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("actions.enroll")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onFileChange(e.target.files?.[0] || null)}
            className="w-full p-2 border rounded-lg"
          />
          <div className="flex gap-3">
            <Button
              onClick={onConfirm}
              disabled={!paymentScreenshot || uploading}
              className="flex-1"
            >
              {uploading ? t("actions.uploading") : t("actions.confirmAndSubmit")}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              {t("actions.cancel")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
