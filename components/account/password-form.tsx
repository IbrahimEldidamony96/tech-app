"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations("Account");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setSubmitting(true);

    const res = await fetch("/api/account/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: currentPassword || undefined,
        newPassword,
      }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(body.error ?? t("passwordUpdateFailed"));
      setSubmitting(false);
      return;
    }

    // This password change atomically revoked all previous JWT sessions,
    // including the current one. Clear its browser cookie and sign in again.
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccess(true);
    await signOut({ redirectTo: "/login?reason=password-changed" });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* يوزر داخل بجوجل بس (hasPassword=false) بيحط أول باسورد له من
          غير ما يثبت باسورد قديم مالوش أصلًا */}
      {hasPassword && (
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">
            {t("currentPassword")}
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full rounded-md border border-steel/25 px-3 py-2 text-sm"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-ink">
          {hasPassword ? t("newPassword") : t("setAPassword")}
        </label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          className="w-full rounded-md border border-steel/25 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-steel">
          {t("passwordRequirements")}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-ink">
          {t("confirmPassword")}
        </label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="w-full rounded-md border border-steel/25 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-alert">{error}</p>}
      {success && <p className="text-sm text-signal">{t("passwordUpdated")}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-ink/90 disabled:opacity-40"
      >
        {submitting
          ? t("saving")
          : hasPassword
            ? t("updatePassword")
            : t("setPassword")}
      </button>
    </form>
  );
}
