import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/login-form";
import { AuthShell } from "@/components/auth-shell";

export default async function LoginPage() {
  const t = await getTranslations("Auth");
  const store = await getTranslations("Storefront");
  return (
    <AuthShell title={store("welcomeBack")} description={store("signInDescription")} eyebrow={t("signIn")} backLabel={store("backToShop")}>
      {/* useSearchParams جوه LoginForm محتاج Suspense boundary، وإلا
          Next.js بيرفض الـ build */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
