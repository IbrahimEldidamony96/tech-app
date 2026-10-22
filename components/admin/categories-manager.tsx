"use client";
import { requestFailureMessage } from "@/lib/request-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { localized } from "@/lib/locale";
import type { AppLocale } from "@/i18n/request";

type Category = {
  id: string;
  nameEn: string;
  nameAr: string;
  slug: string;
  parent: { nameEn: string; nameAr: string } | null;
  parentId?: string | null;
  _count: { products: number; children: number };
};

type ParentOption = { id: string; nameEn: string; nameAr: string };

const emptyForm = { nameEn: "", nameAr: "", slug: "", parentId: "" };

export function CategoriesManager({
  initialCategories,
  parentOptions,
  locale,
}: {
  initialCategories: Category[];
  parentOptions: ParentOption[];
  locale: AppLocale;
}) {
  const router = useRouter();
  const t = useTranslations("AdminCategories");
  const [categories, setCategories] = useState(initialCategories);
  // بنقارن مرجع الـ prop نفسه (مش محتواه) مع نسخة سابقة متخزنة — لو
  // اتغيّر (يعني router.refresh() جاب بيانات جديدة من السيرفر)، بنحدّث
  // categories فورًا وإحنا لسه في نفس الـ render، مش effect بعدها. ده هو
  // النمط اللي React نفسه بيوصي بيه بدل useEffect لتصحيح state بناءً على
  // تغيّر prop — react-hooks/set-state-in-effect بيرفض النسخة التانية
  const [prevInitialCategories, setPrevInitialCategories] = useState(initialCategories);
  if (initialCategories !== prevInitialCategories) {
    setPrevInitialCategories(initialCategories);
    setCategories(initialCategories);
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setForm({ nameEn: cat.nameEn, nameAr: cat.nameAr, slug: cat.slug, parentId: cat.parentId ?? "" });
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    try {
      e.preventDefault();
      setSubmitting(true);
      setError("");

      const url = editingId ? `/api/categories/${editingId}` : "/api/categories";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, parentId: form.parentId || undefined }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("saveFailed"));
        setSubmitting(false);
        return;
      }

      setForm(emptyForm);
      setEditingId(null);
      router.refresh();
      setSubmitting(false);

    } catch { setError(requestFailureMessage()); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(id: string) {
    try {
      setError("");
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("deleteFailed"));
        return;
      }

      setCategories((prev) => prev.filter((c) => c.id !== id));
      router.refresh();

    } catch { setError(requestFailureMessage()); }

  }

  return (
    <div className="mt-6 space-y-8">
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 rounded-lg border border-steel/15 p-4">
        <p className="col-span-2 text-xs font-medium uppercase tracking-wide text-steel">
          {editingId ? t("editingCategory") : t("newCategory")}
        </p>
        <input
          required
          placeholder={t("nameEn")}
          dir="ltr"
          value={form.nameEn}
          onChange={(e) => setForm((p) => ({ ...p, nameEn: e.target.value }))}
          className="rounded-md border border-steel/25 px-3 py-2 text-sm"
        />
        {/* البلاسهولدر ده ثابت بالعربي دايمًا (مش بيتترجم) — بيوضح إن
            الحقل ده لازم يتملى بالعربي، بغض النظر عن لغة واجهة الأدمن */}
        <input
          required
          placeholder="الاسم (عربي)"
          dir="rtl"
          value={form.nameAr}
          onChange={(e) => setForm((p) => ({ ...p, nameAr: e.target.value }))}
          className="rounded-md border border-steel/25 px-3 py-2 text-sm"
        />
        <input
          required
          placeholder={t("slug")}
          dir="ltr"
          value={form.slug}
          onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
          className="rounded-md border border-steel/25 px-3 py-2 font-mono text-sm"
        />
        <select
          value={form.parentId}
          onChange={(e) => setForm((p) => ({ ...p, parentId: e.target.value }))}
          className="rounded-md border border-steel/25 px-3 py-2 text-sm"
        >
          <option value="">{t("noParent")}</option>
          {parentOptions
            .filter((p) => p.id !== editingId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {localized(locale, p.nameEn, p.nameAr)}
              </option>
            ))}
        </select>

        {error && <p className="col-span-2 text-sm text-alert">{error}</p>}

        <div className="col-span-2 flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-md bg-ink py-2 text-sm font-semibold text-paper disabled:opacity-40"
          >
            {submitting ? t("saving") : editingId ? t("saveChanges") : t("addCategory")}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-md border border-steel/25 px-4 py-2 text-sm text-steel hover:text-ink"
            >
              {t("cancel")}
            </button>
          )}
        </div>
      </form>

      <table className="w-full text-sm">
        <thead className="text-start text-xs uppercase tracking-wide text-steel">
          <tr>
            <th className="py-2 text-start">{t("name")}</th>
            <th className="py-2 text-start">{t("parent")}</th>
            <th className="py-2 text-start">{t("products")}</th>
            <th className="py-2 text-start">{t("children")}</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-steel/10">
          {categories.map((cat) => (
            <tr key={cat.id}>
              <td className="py-2 text-ink">{localized(locale, cat.nameEn, cat.nameAr)}</td>
              <td className="py-2 text-steel">
                {cat.parent ? localized(locale, cat.parent.nameEn, cat.parent.nameAr) : "—"}
              </td>
              <td className="py-2 text-steel">{cat._count.products}</td>
              <td className="py-2 text-steel">{cat._count.children}</td>
              <td className="py-2 space-x-3 text-end rtl:space-x-reverse">
                <button onClick={() => startEdit(cat)} className="text-xs text-ink hover:underline">
                  {t("edit")}
                </button>
                <button onClick={() => handleDelete(cat.id)} className="text-xs text-steel hover:text-alert">
                  {t("delete")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
