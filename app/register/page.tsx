"use client";
import { requestFailureMessage } from "@/lib/request-error";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AuthShell } from "@/components/auth-shell";
import { referralCodeFromQuery } from "@/lib/referral-code";
import { safeNextPath } from "@/lib/safe-next-path";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const t = useTranslations("Auth");
  const store = useTranslations("Storefront");
  // "8 حروف على الأقل..." نفس نص صفحة الحساب بالظبط — بنستخدمه من هناك
  // بدل ما نكرره في namespace جديد
  const tAccount = useTranslations("Account");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    try {
      e.preventDefault();
      setLoading(true);
      setError("");

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, referralCode: referralCodeFromQuery(searchParams.get("ref")) }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Zod بيرجع أخطاء متعددة (fieldErrors) — بناخد أول واحدة نلاقيها
        const firstFieldError = body.details?.fieldErrors
          ? (Object.values(body.details.fieldErrors)[0] as string[] | undefined)?.[0]
          : null;
        setError(firstFieldError ?? body.error ?? t("registrationFailed"));
        setLoading(false);
        return;
      }

      // التسجيل نجح — بنسجّله دخول على طول بنفس البيانات، بدل ما نرجّعه
      // لصفحة login منفصلة يكتب فيها نفس حاجة كتبها لسه
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        router.push(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      router.push(next);
      router.refresh();

    } catch { setError(requestFailureMessage()); }
    finally { setLoading(false); }
  }

  return (
    <AuthShell title={t("createAccountHeading")} description={store("createAccountDescription")} eyebrow={store("account")} backLabel={store("backToShop")}>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="register-name" className="mb-2 block text-sm font-medium text-ink">{t("name")}</label>
          <input
            id="register-name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field-input w-full"
          />
        </div>
        <div>
          <label htmlFor="register-email" className="mb-2 block text-sm font-medium text-ink">{t("email")}</label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-input w-full"
          />
        </div>
        <div>
          <label htmlFor="register-password" className="mb-2 block text-sm font-medium text-ink">{t("password")}</label>
          <input
            id="register-password"
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
          {loading ? t("creatingAccount") : t("createAccount")}
        </button>
      </form>

      <p className="mt-7 text-center text-sm leading-6 text-steel">
        {t("alreadyHaveAccount")}{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-accent hover:underline">
          {t("signIn")}
        </Link>
      </p>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
