"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";

type Row = {
  variantId: string;
  quantity: number;
  sku?: string;
  price?: number;
  regularPrice?: number;
  saleActive?: boolean;
  stock?: number;
  unavailable?: boolean;
  optionSummaryEn?: string;
  optionSummaryAr?: string;
  product?: { nameEn: string; nameAr: string; slug: string; images: { url: string }[] };
};

function read() {
  try {
    return JSON.parse(localStorage.getItem("guestCart") ?? "[]") as { variantId: string; quantity: number }[];
  } catch {
    return [];
  }
}

export function GuestCart() {
  const locale = useLocale();
  const t = useTranslations("Cart");
  const store = useTranslations("Storefront");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const items = read();
    if (!items.length) {
      setRows([]);
      setLoading(false);
      return;
    }
    const response = await fetch("/api/guest-cart/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const body = await response.json();
    setRows(body.data ?? []);
    setLoading(false);
  }

  useEffect(() => { void Promise.resolve().then(load); }, []);

  function save(next: { variantId: string; quantity: number }[]) {
    localStorage.setItem("guestCart", JSON.stringify(next));
    window.dispatchEvent(new Event("guest-cart-changed"));
    void load();
  }

  const subtotal = useMemo(() => rows.reduce((sum, row) => sum + (row.price ?? 0) * row.quantity, 0), [rows]);

  if (loading) {
    return <div role="status" className="surface-card mt-9 flex min-h-48 items-center justify-center gap-3 text-sm text-steel"><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />{store("loading")}</div>;
  }

  if (!rows.length) {
    return (
      <div className="surface-card mt-9 flex min-h-80 flex-col items-center justify-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-mist text-accent" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 8h14l1 13H4L5 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></svg></div>
        <p className="font-display text-xl font-semibold text-ink">{t("empty")}</p>
        <p className="mt-2 max-w-sm text-sm leading-6 text-steel">{store("emptyCartDescription")}</p>
        <Link href="/" className="button-primary mt-6">{t("browseProducts")}</Link>
      </div>
    );
  }

  return (
    <div className="mt-9 grid items-start gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
      <ul className="surface-card divide-y divide-line">
        {rows.map((row) => {
          const productName = row.product ? (locale === "ar" ? row.product.nameAr : row.product.nameEn) : t("unavailable");
          return (
            <li key={row.variantId} className="flex gap-4 py-6 first:pt-0 last:pb-0 sm:gap-5">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-mist sm:h-28 sm:w-28">
                {row.product?.images[0] && <Image src={row.product.images[0].url} alt={productName} fill className="object-contain p-3" sizes="112px" />}
              </div>
              <div className="min-w-0 flex-1">
                <Link href={row.product ? `/products/${row.product.slug}` : "#"} className="font-display text-base font-semibold leading-6 text-ink hover:text-accent">{productName}</Link>
                <p className="mt-1 text-xs leading-5 text-steel">{locale === "ar" ? row.optionSummaryAr : row.optionSummaryEn}</p>
                <p className="mt-2 text-sm font-semibold tabular-nums text-ink">{row.price !== undefined ? `EGP ${row.price.toLocaleString()}` : "—"}</p>
                {row.unavailable && <p className="mt-1 text-xs text-alert">{t("unavailable")}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <div className="flex items-center overflow-hidden rounded-full border border-line bg-paper">
                    <button type="button" aria-label={t("decreaseQuantity")} onClick={() => save(read().map((item) => item.variantId === row.variantId ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))} className="flex h-9 w-9 items-center justify-center text-steel transition-colors hover:bg-mist hover:text-ink">−</button>
                    <span className="w-7 text-center text-xs font-medium tabular-nums text-ink">{row.quantity}</span>
                    <button type="button" aria-label={t("increaseQuantity")} onClick={() => save(read().map((item) => item.variantId === row.variantId ? { ...item, quantity: Math.min(10, row.stock ?? 10, item.quantity + 1) } : item))} className="flex h-9 w-9 items-center justify-center text-steel transition-colors hover:bg-mist hover:text-ink">+</button>
                  </div>
                  <button type="button" onClick={() => save(read().filter((item) => item.variantId !== row.variantId))} className="py-2 text-xs text-steel underline decoration-line underline-offset-4 hover:text-alert">{t("remove")}</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <aside className="surface-card lg:sticky lg:top-28">
        <p className="eyebrow">{store("yourBag")}</p>
        <div className="mt-5 flex items-center justify-between gap-4 border-b border-line pb-6">
          <span className="text-sm text-steel">{t("subtotal")}</span>
          <strong className="text-xl font-semibold tracking-tight tabular-nums text-ink">EGP {subtotal.toLocaleString()}</strong>
        </div>
        <Link href="/checkout" className="button-primary mt-6 w-full">{t("proceedToCheckout")}</Link>
        <Link href="/" className="mt-4 block text-center text-xs font-medium text-steel hover:text-accent">{store("backToShop")}</Link>
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-steel"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>{store("secureCheckout")}</p>
      </aside>
    </div>
  );
}
