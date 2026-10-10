"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { localized } from "@/lib/locale";
import type { AppLocale } from "@/i18n/request";

type OptionValue = { id: string; valueEn: string; valueAr: string };
type Option = { id: string; nameEn: string; nameAr: string; values: OptionValue[] };
type Variant = { id: string; sku: string; price: number; salePrice?: number | null; saleActive?: boolean; stock: number; optionValueIds: string[] };

export function VariantSelector({
  options,
  variants,
  locale,
}: {
  options: Option[];
  variants: Variant[];
  locale: AppLocale;
}) {
  const t = useTranslations("VariantSelector");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<"idle" | "loading" | "added" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // لازم اليوزر يختار قيمة لكل Option (لون + مساحة مثلاً) قبل ما نعرف
  // الـ variant المحدد. بنقارن مجموعة الاختيارات (بعد ترتيبها) مع
  // مجموعة optionValueIds بتاعة كل variant — تطابق كامل = ده هو
  const matchedVariant = useMemo(() => {
    if (Object.keys(selected).length !== options.length) return null;
    const selectedIds = Object.values(selected).sort();
    return (
      variants.find((v) => {
        const ids = [...v.optionValueIds].sort();
        return ids.length === selectedIds.length && ids.every((id, i) => id === selectedIds[i]);
      }) ?? null
    );
  }, [selected, options.length, variants]);

  const maxQuantity = matchedVariant ? Math.min(10, matchedVariant.stock) : 10;

  async function handleAddToCart() {
    if (!matchedVariant) return;
    setStatus("loading");
    setErrorMessage("");

    const res = await fetch("/api/cart/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId: matchedVariant.id, quantity }),
    });

    if (res.status === 401) {
      let cart: { variantId: string; quantity: number }[] = [];
      try { cart = JSON.parse(localStorage.getItem("guestCart") ?? "[]"); } catch {}
      const existing = cart.find((item) => item.variantId === matchedVariant.id);
      const next = existing
        ? cart.map((item) => item.variantId === matchedVariant.id ? { ...item, quantity: Math.min(10, item.quantity + quantity) } : item)
        : [...cart, { variantId: matchedVariant.id, quantity }];
      localStorage.setItem("guestCart", JSON.stringify(next));
      window.dispatchEvent(new Event("guest-cart-changed"));
      setStatus("added");
      setTimeout(() => setStatus("idle"), 2000);
      return;
    }

    if (!res.ok) {
      const responseBody = await res.json().catch(() => ({}));
      setErrorMessage(responseBody.error ?? "Something went wrong");
      setStatus("error");
      return;
    }

    setStatus("added");
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="space-y-6">
      {options.map((option) => (
        <div key={option.id}>
          <p className="mb-3 text-xs font-semibold tracking-wide text-ink">
            {localized(locale, option.nameEn, option.nameAr)}
          </p>
          <div className="flex flex-wrap gap-2">
            {option.values.map((value) => {
              const isSelected = selected[option.id] === value.id;
              return (
                <button
                  key={value.id}
                  type="button"
                  onClick={() => setSelected((prev) => ({ ...prev, [option.id]: value.id }))}
                  aria-pressed={isSelected}
                  className={`min-h-11 rounded-xl border px-5 py-2.5 text-sm font-medium transition-colors ${
                    isSelected ? "border-accent bg-mist text-accent ring-1 ring-accent" : "border-line bg-surface text-ink hover:border-accent/50"
                  }`}
                >
                  {localized(locale, value.valueEn, value.valueAr)}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="border-t border-line pt-6">
        {matchedVariant ? (
          <>
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="font-display text-3xl font-semibold tracking-tight text-ink">
                EGP {(matchedVariant.saleActive && matchedVariant.salePrice ? matchedVariant.salePrice : matchedVariant.price).toLocaleString()}
              </p>
              {matchedVariant.saleActive && matchedVariant.salePrice ? (
                <span className="text-sm text-steel line-through">EGP {matchedVariant.price.toLocaleString()}</span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-steel">
              {t("sku", { sku: matchedVariant.sku })} ·{" "}
              {matchedVariant.stock === 0 ? (
                <span className="text-alert">{t("outOfStock")}</span>
              ) : (
                <span className="text-accent">{t("inStock", { count: matchedVariant.stock })}</span>
              )}
            </p>
          </>
        ) : (
          options.length > 0 && (
            <p className="text-sm text-steel">{t("selectOptions")}</p>
          )
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex h-12 items-center rounded-full border border-line bg-surface">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="flex size-11 items-center justify-center rounded-full text-steel hover:text-accent disabled:opacity-35"
              aria-label={t("decreaseQuantity")}
            >
              −
            </button>
            <span className="w-7 text-center text-sm font-semibold tabular-nums">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
              disabled={quantity >= maxQuantity}
              className="flex size-11 items-center justify-center rounded-full text-steel hover:text-accent disabled:opacity-35"
              aria-label={t("increaseQuantity")}
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!matchedVariant || matchedVariant.stock === 0 || status === "loading"}
            className="button-primary min-h-12 flex-1 gap-3 px-7 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 7h14l-2 9H8L5 3H2" /><circle cx="9" cy="20" r="1" /><circle cx="17" cy="20" r="1" /></svg>
            {status === "loading" ? t("adding") : status === "added" ? t("added") : t("addToCart")}
          </button>
        </div>

        {status === "error" && <p role="alert" className="mt-3 text-sm text-alert">{errorMessage}</p>}
      </div>
    </div>
  );
}
