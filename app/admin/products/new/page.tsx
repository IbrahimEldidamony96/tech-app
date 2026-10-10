import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ProductForm } from "@/components/admin/product-form";
import type { AppLocale } from "@/i18n/request";

export default async function NewProductPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "catalog:write")) redirect("/");

  const [categories, brands] = await Promise.all([
    prisma.category.findMany({ orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, nameAr: true } }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const t = await getTranslations("AdminProductForm");
  const locale = (await getLocale()) as AppLocale;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-2xl font-bold text-ink">{t("newProductHeading")}</h1>
      <ProductForm categories={categories} brands={brands} locale={locale} />
    </div>
  );
}
