import { redirect, notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getProductForAdminEdit } from "@/lib/queries/admin-products";
import { ProductForm } from "@/components/admin/product-form";
import { ProductVariantsSection } from "@/components/admin/product-variants-section";
import { ProductImagesManager } from "@/components/admin/product-images-manager";
import { ProductSpecificationsManager } from "@/components/admin/product-specifications-manager";
import { ProductArchiveButton } from "@/components/admin/product-archive-button";
import { localized } from "@/lib/locale";
import type { AppLocale } from "@/i18n/request";

type Params = Promise<{ id: string }>;

export default async function EditProductPage({ params }: { params: Params }) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "catalog:write")) redirect("/");

  const { id } = await params;

  const [product, categories, brands, options, variants] = await Promise.all([
    getProductForAdminEdit(id),
    prisma.category.findMany({
      orderBy: { nameEn: "asc" },
      select: { id: true, nameEn: true, nameAr: true },
    }),
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.productOption.findMany({
      where: { productId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        values: { select: { id: true, valueEn: true, valueAr: true } },
      },
    }),
    prisma.productVariant.findMany({
      where: { productId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        sku: true,
        price: true,
        stock: true,
        isActive: true,
        salePrice: true,
        saleStartsAt: true,
        saleEndsAt: true,
        optionValues: {
          select: { optionValue: { select: { valueEn: true, valueAr: true } } },
        },
      },
    }),
  ]);

  if (!product) notFound();

  const t = await getTranslations("AdminProductForm");
  const locale = (await getLocale()) as AppLocale;

  // Decimal -> number وبناء ملخص الخصائص ("Black / 128GB") من العلاقات المتداخلة،
  // باللغة الحالية للواجهة
  const mappedVariants = variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    price: v.price.toNumber(),
    stock: v.stock,
    isActive: v.isActive,
    salePrice: v.salePrice?.toNumber() ?? null,
    saleStartsAt: v.saleStartsAt?.toISOString() ?? null,
    saleEndsAt: v.saleEndsAt?.toISOString() ?? null,
    optionSummary: v.optionValues
      .map((ov) => localized(locale, ov.optionValue.valueEn, ov.optionValue.valueAr))
      .join(" / "),
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-2xl font-bold text-ink">{t("editProductHeading")}</h1>
      <ProductForm
        categories={categories}
        brands={brands}
        locale={locale}
        initialData={{
          id: product.id,
          nameEn: product.nameEn,
          nameAr: product.nameAr,
          slug: product.slug,
          descriptionEn: product.descriptionEn ?? "",
          descriptionAr: product.descriptionAr ?? "",
          categoryId: product.categoryId,
          brandId: product.brandId ?? "",
          metaTitleEn: product.metaTitleEn ?? "",
          metaTitleAr: product.metaTitleAr ?? "",
          metaDescriptionEn: product.metaDescriptionEn ?? "",
          metaDescriptionAr: product.metaDescriptionAr ?? "",
        }}
      />
      <div className="mt-4 flex justify-end"><ProductArchiveButton productId={product.id} archived={!!product.deletedAt} /></div>
      <ProductImagesManager
        productId={product.id}
        initialImages={product.images}
      />
      <ProductSpecificationsManager productId={product.id} initialSpecifications={product.specifications} />
      <ProductVariantsSection
        productId={product.id}
        initialOptions={options}
        initialVariants={mappedVariants}
        locale={locale}
      />
    </div>
  );
}
