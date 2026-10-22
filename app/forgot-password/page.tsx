"use client";
import { requestFailureMessage } from "@/lib/request-error";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AuthShell } from "@/components/auth-shell";

export default function ForgotPasswordPage() {
  const t = useTranslations("Auth");
  const store = useTranslations("Storefront");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    try {
      e.preventDefault();
      setLoading(true);
      setError("");

      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      setLoading(false);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("somethingWentWrong"));
        return;
      }

      // نفس الرسالة دايمًا — السيرفر نفسه ميقولش إذا الإيميل موجود ولا
      // لأ، فمفيش داعي الفرونت إند يفرّق هنا برضو
      setSent(true);

    } catch { setError(requestFailureMessage()); }
    finally { setLoading(false); }
  }

  if (sent) {
    return (
      <AuthShell title={t("checkYourEmail")} description={t("resetLinkSentIfExists")} eyebrow={store("account")} backLabel={store("backToShop")}>
        <Link href="/login" className="button-primary w-full">
          {t("backToSignIn")}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("forgotPasswordHeading")} description={t("forgotPasswordSubheading")} eyebrow={store("account")} backLabel={store("backToShop")}>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="forgot-email" className="mb-2 block text-sm font-medium text-ink">{t("email")}</label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-input w-full"
          />
        </div>

        {error && <p role="alert" className="rounded-xl bg-alert/5 p-3 text-sm text-alert">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="button-primary w-full disabled:opacity-50"
        >
          {loading ? t("sending") : t("sendResetLink")}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-steel">
        <Link href="/login" className="font-semibold text-accent hover:underline">
          {t("backToSignIn")}
        </Link>
      </p>
    </AuthShell>
  );
}
