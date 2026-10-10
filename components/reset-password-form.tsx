"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const t = useTranslations("Auth");
  const tAccount = useTranslations("Account");

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const firstFieldError = body.details?.fieldErrors
        ? (Object.values(body.details.fieldErrors)[0] as string[] | undefined)?.[0]
        : null;
      setError(firstFieldError ?? body.error ?? t("somethingWentWrong"));
      return;
    }

    setDone(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-sm text-alert">{t("resetLinkInvalid")}</p>
        <Link href="/forgot-password" className="mt-4 inline-block text-sm font-medium text-ink hover:underline">
          {t("requestNewResetLink")}
        </Link>
      </div>
    );
  }

  if (done) {
    return <p className="text-center text-sm text-steel">{t("passwordResetSuccess")}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="reset-password" className="mb-2 block text-sm font-medium text-ink">{t("newPassword")}</label>
        <input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field-input w-full"
        />
        <p className="mt-2 text-xs leading-5 text-steel">{tAccount("passwordRequirements")}</p>
      </div>

      {error && <p role="alert" className="rounded-xl bg-alert/5 p-3 text-sm text-alert">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="button-primary w-full disabled:opacity-50"
      >
        {loading ? t("resettingPassword") : t("resetPassword")}
      </button>
    </form>
  );
}
