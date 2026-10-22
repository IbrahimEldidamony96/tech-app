"use client";
import { requestFailureMessage } from "@/lib/request-error";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function CompletePaymentButton({ orderId }: { orderId: string }) {
  const t = useTranslations("OrderDetail");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`/api/orders/${orderId}/pay`, { method: "POST" });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error ?? t("paymentStartFailed"));
        setLoading(false);
        return;
      }

      window.location.href = body.data.checkoutUrl;

    } catch { setError(requestFailureMessage()); }
    finally { setLoading(false); }
  }

  return (
    <div className="mt-4">
      {error && <p className="mb-2 text-sm text-alert">{error}</p>}
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-40"
      >
        {loading ? t("redirectingToPayment") : t("completePayment")}
      </button>
    </div>
  );
}
