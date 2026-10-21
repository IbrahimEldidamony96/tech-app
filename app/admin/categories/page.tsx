import { requireAdminPagePermission } from "@/lib/require-admin-page-permission";
import { getTranslations, getLocale } from "next-intl/server";
import { getAllCategoriesForAdmin } from "@/lib/queries/admin-categories";
import { CategoriesManager } from "@/components/admin/categories-manager";
import type { AppLocale } from "@/i18n/request";

export default async function AdminCategoriesPage() {
  await requireAdminPagePermission("catalog:read");

  const categories = await getAllCategoriesForAdmin();
  const parentOptions = categories.map((c) => ({ id: c.id, nameEn: c.nameEn, nameAr: c.nameAr }));
  const t = await getTranslations("AdminCategories");
  const locale = (await getLocale()) as AppLocale;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-2xl font-bold text-ink">{t("title")}</h1>
      <CategoriesManager initialCategories={categories} parentOptions={parentOptions} locale={locale} />
    </div>
  );
}
