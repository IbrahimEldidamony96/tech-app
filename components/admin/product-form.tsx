"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { localized } from "@/lib/locale";
import type { AppLocale } from "@/i18n/request";

type Category = { id: string; nameEn: string; nameAr: string };
type Brand = { id: string; name: string };

type FormData = {
  id?: string;
  nameEn: string;
  nameAr: string;
  slug: string;
  descriptionEn: string;
  descriptionAr: string;
  categoryId: string;
  brandId: string;
  metaTitleEn: string;
  metaTitleAr: string;
  metaDescriptionEn: string;
  metaDescriptionAr: string;
};

const empty: FormData = {
  nameEn: "",
  nameAr: "",
  slug: "",
  descriptionEn: "",
  descriptionAr: "",
  categoryId: "",
  brandId: "",
  metaTitleEn: "",
  metaTitleAr: "",
  metaDescriptionEn: "",
  metaDescriptionAr: "",
};

const emptyVariant = { sku: "", price: "", stock: "" };

export function ProductForm({
  categories,
  brands,
  initialData,
  locale,
}: {
  categories: Category[];
  brands: Brand[];
  initialData?: FormData;
  locale: AppLocale;
}) {
  const router = useRouter();
  const t = useTranslations("AdminProductForm");
  const isEdit = !!initialData?.id;
  const [form, setForm] = useState<FormData>(initialData ?? empty);
  const [variant, setVariant] = useState(emptyVariant);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  function field(key: keyof FormData) {
    return {
      value: form[key] ?? "",
      onChange: (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    // Edit sends "" / null so an emptied description or brand is really cleared
    // (undefined would be dropped from the JSON and silently ignored).
    const payload = {
      nameEn: form.nameEn,
      nameAr: form.nameAr,
      slug: form.slug,
      descriptionEn: isEdit ? form.descriptionEn : form.descriptionEn || undefined,
      descriptionAr: isEdit ? form.descriptionAr : form.descriptionAr || undefined,
      categoryId: form.categoryId,
      brandId: isEdit ? form.brandId || null : form.brandId || undefined,
      metaTitleEn: isEdit ? form.metaTitleEn : form.metaTitleEn || undefined,
      metaTitleAr: isEdit ? form.metaTitleAr : form.metaTitleAr || undefined,
      metaDescriptionEn: isEdit ? form.metaDescriptionEn : form.metaDescriptionEn || undefined,
      metaDescriptionAr: isEdit ? form.metaDescriptionAr : form.metaDescriptionAr || undefined,
    };

    const url = isEdit ? `/api/products/${initialData!.id}` : "/api/products";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? t("saveFailed"));
      setSubmitting(false);
      return;
    }

    const body = await res.json();

    // الـ variant الافتراضي اختياري فعليًا — لو السكو فاضي، معناها اليوزر
    // عايز يضيف Options/Variants حقيقية بنفسه في صفحة الـ edit بعد كده،
    // فمنعملش أي طلب هنا خالص
    if (!isEdit && variant.sku.trim() !== "") {
      const variantRes = await fetch(`/api/products/${body.data.id}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: variant.sku,
          price: Number(variant.price),
          stock: Number(variant.stock),
        }),
      });

      if (!variantRes.ok) {
        const vBody = await variantRes.json().catch(() => ({}));
        setError(
          `${t("variantFailedPrefix")} ${vBody.error ?? t("unknownError")}`,
        );
        setSubmitting(false);
        return;
      }
    }

    if (!isEdit) {
      // منتج جديد — نروح لصفحة الـ edit بتاعه على طول، عشان يقدر يضيف
      // Options وVariants حقيقية من نفس المكان اللي شافه في صفحة التعديل،
      // بدل ما يرجع للقائمة ويدور عليه تاني
      router.push(`/admin/products/${body.data.id}/edit`);
      router.refresh();
      return;
    }

    // تعديل منتج موجود — منسيبش الصفحة خالص، عشان أقسام Options/Variants
    // اللي تحت (لو موجودة) تفضل شغالة على نفس الصفحة دي
    setSubmitting(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-2 gap-4">
      <input
        required
        placeholder={t("nameEn")}
        dir="ltr"
        {...field("nameEn")}
        className="rounded-md border border-steel/25 px-3 py-2 text-sm"
      />
      <input
        required
        placeholder="الاسم (عربي)"
        dir="rtl"
        {...field("nameAr")}
        className="rounded-md border border-steel/25 px-3 py-2 text-sm"
      />
      <input
        required
        placeholder={t("slug")}
        dir="ltr"
        {...field("slug")}
        className="col-span-2 rounded-md border border-steel/25 px-3 py-2 font-mono text-sm"
      />
      <textarea
        placeholder={t("descriptionEn")}
        dir="ltr"
        rows={3}
        {...field("descriptionEn")}
        className="rounded-md border border-steel/25 px-3 py-2 text-sm"
      />
      <textarea
        placeholder="الوصف (عربي)"
        dir="rtl"
        rows={3}
        {...field("descriptionAr")}
        className="rounded-md border border-steel/25 px-3 py-2 text-sm"
      />

      <select
        required
        {...field("categoryId")}
        className="rounded-md border border-steel/25 px-3 py-2 text-sm"
      >
        <option value="">{t("selectCategory")}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {localized(locale, c.nameEn, c.nameAr)}
          </option>
        ))}
      </select>

      <select
        {...field("brandId")}
        className="rounded-md border border-steel/25 px-3 py-2 text-sm"
      >
        <option value="">{t("noBrand")}</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      <p className="col-span-2 mt-3 text-xs font-medium uppercase tracking-wide text-steel">SEO</p>
      <input placeholder="SEO title (English)" dir="ltr" {...field("metaTitleEn")} className="rounded-md border border-steel/25 px-3 py-2 text-sm" />
      <input placeholder="عنوان SEO (عربي)" dir="rtl" {...field("metaTitleAr")} className="rounded-md border border-steel/25 px-3 py-2 text-sm" />
      <textarea rows={2} placeholder="Meta description (English)" dir="ltr" {...field("metaDescriptionEn")} className="rounded-md border border-steel/25 px-3 py-2 text-sm" />
      <textarea rows={2} placeholder="وصف Meta (عربي)" dir="rtl" {...field("metaDescriptionAr")} className="rounded-md border border-steel/25 px-3 py-2 text-sm" />

      {!isEdit && (
        <>
          <p className="col-span-2 mt-2 text-xs font-medium uppercase tracking-wide text-steel">
            {t("defaultVariantHeading")}
          </p>
          <input
            placeholder={t("sku")}
            dir="ltr"
            value={variant.sku}
            onChange={(e) => setVariant((p) => ({ ...p, sku: e.target.value }))}
            className="rounded-md border border-steel/25 px-3 py-2 font-mono text-sm"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder={t("price")}
            dir="ltr"
            value={variant.price}
            onChange={(e) =>
              setVariant((p) => ({ ...p, price: e.target.value }))
            }
            className="rounded-md border border-steel/25 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min="0"
            step="1"
            placeholder={t("stock")}
            dir="ltr"
            value={variant.stock}
            onChange={(e) =>
              setVariant((p) => ({ ...p, stock: e.target.value }))
            }
            className="col-span-2 rounded-md border border-steel/25 px-3 py-2 text-sm"
          />
        </>
      )}

      {error && <p className="col-span-2 text-sm text-alert">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="col-span-2 rounded-md bg-signal py-2.5 text-sm font-semibold text-ink disabled:opacity-40"
      >
        {submitting
          ? t("saving")
          : saved
            ? t("saved")
            : isEdit
              ? t("saveChanges")
              : t("createProduct")}
      </button>

      {!isEdit && (
        <p className="col-span-2 text-xs text-steel">
          {t("defaultVariantNote")}
        </p>
      )}
    </form>
  );
}
