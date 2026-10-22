"use client";
import { requestFailureMessage } from "@/lib/request-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

// الصفحة اللي بتستخدم الزرار ده (app/admin/reviews/page.tsx) Server
// Component بيقرا من الداتابيز مباشرة كل مرة — فمفيش قايمة client-state
// محتاجة نزامنها زي مشكلة categories/brands قبل كده؛ router.refresh()
// هنا كافي لوحده لأن الصفحة نفسها هتعيد الجلب من غير أي useState وسيط
export function DeleteReviewButton({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const t = useTranslations("AdminReviews");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    try {
      const confirmed = window.confirm(t("confirmDelete"));
      if (!confirmed) return;

      setDeleting(true);
      setError("");

      const res = await fetch(`/api/reviews/${reviewId}`, { method: "DELETE" });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("deleteFailed"));
        setDeleting(false);
        return;
      }

      router.refresh();

    } catch { setError(requestFailureMessage()); }
    finally { setDeleting(false); }
  }

  return (
    <span className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="text-xs text-steel hover:text-alert disabled:opacity-40"
      >
        {deleting ? t("deleting") : t("delete")}
      </button>
      {error && <span className="text-[11px] text-alert">{error}</span>}
    </span>
  );
}
