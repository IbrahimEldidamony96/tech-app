"use client";
import { requestFailureMessage } from "@/lib/request-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const t = useTranslations("OrderDetail");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCancel() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error ?? t("cancelFailed"));
        setLoading(false);
        setConfirming(false);
        return;
      }

      router.refresh();

    } catch { setError(requestFailureMessage()); }
    finally { setLoading(false); }
  }

  if (confirming) {
    return (
      <div className="mt-4">
        {error && <p className="mb-2 text-sm text-alert">{error}</p>}
        <p className="mb-2 text-sm text-ink">{t("cancelConfirm")}</p>
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            disabled={loading}
            className="rounded-md bg-alert px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {loading ? t("cancelling") : t("cancelConfirmYes")}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={loading}
            className="rounded-md border border-steel/30 px-4 py-2 text-sm font-semibold text-ink hover:bg-steel/5 disabled:opacity-40"
          >
            {t("cancelConfirmNo")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {error && <p className="mb-2 text-sm text-alert">{error}</p>}
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md border border-alert/40 px-4 py-2 text-sm font-semibold text-alert hover:bg-alert/10"
      >
        {t("cancelOrder")}
      </button>
    </div>
  );
}
