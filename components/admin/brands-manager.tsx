"use client";
import { requestFailureMessage } from "@/lib/request-error";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type Brand = { id: string; name: string; slug: string; _count: { products: number } };

const emptyForm = { name: "", slug: "" };

export function BrandsManager({ initialBrands }: { initialBrands: Brand[] }) {
  const router = useRouter();
  const t = useTranslations("AdminBrands");
  const [brands, setBrands] = useState(initialBrands);
  // نفس نمط categories-manager.tsx بالظبط — تصحيح الـ state أثناء الـ
  // render نفسه لما مرجع initialBrands يتغيّر، بدل useEffect
  const [prevInitialBrands, setPrevInitialBrands] = useState(initialBrands);
  if (initialBrands !== prevInitialBrands) {
    setPrevInitialBrands(initialBrands);
    setBrands(initialBrands);
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function startEdit(brand: Brand) {
    setEditingId(brand.id);
    setForm({ name: brand.name, slug: brand.slug });
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

      const url = editingId ? `/api/brands/${editingId}` : "/api/brands";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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

  async function handleDelete(id: string, productCount: number) {
    try {
      setError("");

      // تحذير ودّي — مش منع فعلي، لأن الـ API نفسه بيسمح (onDelete: SetNull)
      if (productCount > 0) {
        const confirmed = window.confirm(t("deleteConfirm", { count: productCount }));
        if (!confirmed) return;
      }

      const res = await fetch(`/api/brands/${id}`, { method: "DELETE" });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("deleteFailed"));
        return;
      }

      setBrands((prev) => prev.filter((b) => b.id !== id));
      router.refresh();

    } catch { setError(requestFailureMessage()); }

  }

  return (
    <div className="mt-6 space-y-8">
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 rounded-lg border border-steel/15 p-4">
        <p className="col-span-2 text-xs font-medium uppercase tracking-wide text-steel">
          {editingId ? t("editingBrand") : t("newBrand")}
        </p>
        <input
          required
          placeholder={t("name")}
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
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

        {error && <p className="col-span-2 text-sm text-alert">{error}</p>}

        <div className="col-span-2 flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-md bg-ink py-2 text-sm font-semibold text-paper disabled:opacity-40"
          >
            {submitting ? t("saving") : editingId ? t("saveChanges") : t("addBrand")}
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
            <th className="py-2 text-start">{t("slug")}</th>
            <th className="py-2 text-start">{t("products")}</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-steel/10">
          {brands.map((brand) => (
            <tr key={brand.id}>
              <td className="py-2 text-ink">{brand.name}</td>
              <td className="py-2 font-mono text-xs text-steel">{brand.slug}</td>
              <td className="py-2 text-steel">{brand._count.products}</td>
              <td className="py-2 space-x-3 text-end rtl:space-x-reverse">
                <button onClick={() => startEdit(brand)} className="text-xs text-ink hover:underline">
                  {t("edit")}
                </button>
                <button
                  onClick={() => handleDelete(brand.id, brand._count.products)}
                  className="text-xs text-steel hover:text-alert"
                >
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
