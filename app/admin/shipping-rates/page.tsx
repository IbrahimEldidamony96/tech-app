import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { getShippingRatesForAdmin } from "@/lib/queries/admin-shipping-rates";
import { ShippingRatesManager } from "@/components/admin/shipping-rates-manager";
import { BostaApiError } from "@/lib/bosta";
import type { AppLocale } from "@/i18n/request";

export default async function AdminShippingRatesPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "settings:manage")) redirect("/");

  const t = await getTranslations("AdminShippingRates");
  const locale = (await getLocale()) as AppLocale;

  // getShippingRatesForAdmin بتنادي Bosta لايف (getBostaCities) — لو
  // BOSTA_API_KEY مش متظبط أو Bosta واقعة، من غير try/catch هنا الصفحة
  // كلها كانت هتوقع بـ 500 عام بدل رسالة واضحة تقول المشكلة فين بالظبط
  let rates: Awaited<ReturnType<typeof getShippingRatesForAdmin>> | null = null;
  let loadError: string | null = null;
  try {
    rates = await getShippingRatesForAdmin();
  } catch (err) {
    loadError =
      err instanceof BostaApiError || err instanceof Error
        ? err.message
        : t("loadErrorFallback");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-2xl font-bold text-ink">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-steel">
        {t("description")}
      </p>
      {loadError ? (
        <p className="mt-6 rounded-md border border-alert/30 bg-alert/5 p-4 text-sm text-alert">
          {t("loadErrorPrefix")} {loadError}.{" "}
          {t.rich("loadErrorHelp", {
            code: (chunks) => <code>{chunks}</code>,
          })}
        </p>
      ) : (
        <ShippingRatesManager initialRates={rates!} locale={locale} />
      )}
    </div>
  );
}
