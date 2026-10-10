import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { AuthShell } from "@/components/auth-shell";

export default async function ResetPasswordPage() {
  const t = await getTranslations("Auth");
  const store = await getTranslations("Storefront");
  return (
    <AuthShell title={t("resetPasswordHeading")} description={store("resetPasswordDescription")} eyebrow={store("account")} backLabel={store("backToShop")}>
      {/* useSearchParams جوه ResetPasswordForm محتاج Suspense boundary،
          وإلا Next.js بيرفض الـ build */}
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
