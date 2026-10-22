"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function EmailVerificationBanner() {
  const t = useTranslations("Account");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleResend() {
    try {
    setStatus("sending");
    const res = await fetch("/api/auth/verify-email/resend", { method: "POST" });
    setStatus(res.ok ? "sent" : "error");

    } catch { setStatus("error"); }

  }

  return (
    <div className="mb-8 flex items-center justify-between gap-4 rounded-md border border-amber-400/40 bg-amber-50 px-4 py-3 text-sm">
      <span className="text-amber-900">{t("emailNotVerified")}</span>
      {status === "sent" ? (
        <span className="shrink-0 text-amber-700">{t("verificationEmailSent")}</span>
      ) : (
        <button
          onClick={handleResend}
          disabled={status === "sending"}
          className="shrink-0 font-medium text-amber-900 underline hover:no-underline disabled:opacity-50"
        >
          {status === "sending" ? t("sending") : t("resendVerificationEmail")}
        </button>
      )}
    </div>
  );
}
