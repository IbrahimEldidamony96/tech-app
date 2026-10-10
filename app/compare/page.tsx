"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { StorefrontIcon } from "@/components/storefront-icon";

type CompareProduct = {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  averageRating: string | number;
  reviewCount: number;
  brand: { name: string } | null;
  category: { nameEn: string; nameAr: string };
  specifications: { keyEn: string; keyAr: string; valueEn: string; valueAr: string }[];
  variants: { price: string | number; salePrice: string | number | null; saleStartsAt: string | null; saleEndsAt: string | null; stock: number }[];
};

function subscribeToCompare(onChange: () => void) {
  window.addEventListener("compare-products-changed", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("compare-products-changed", onChange);
    window.removeEventListener("storage", onChange);
  };
}

function compareSnapshot() {
  try { return localStorage.getItem("compareProductIds") ?? "[]"; }
  catch { return "[]"; }
}

function serverCompareSnapshot() {
  return null;
}

export default function ComparePage() {
  const t = useTranslations("Storefront");
  const productText = useTranslations("ProductPage");
  const locale = useLocale();
  const savedSelection = useSyncExternalStore<string | null>(subscribeToCompare, compareSnapshot, serverCompareSnapshot);
  const selection = useMemo(() => {
    if (savedSelection === null) return "";
    try {
      const ids: unknown = JSON.parse(savedSelection);
      return Array.isArray(ids)
        ? [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, 4).join(",")
        : "";
    } catch { return ""; }
  }, [savedSelection]);
  const [revision, setRevision] = useState(0);
  const requestKey = selection + ":" + revision;
  const [result, setResult] = useState<{ key: string; products: CompareProduct[]; failed: boolean }>({ key: "", products: [], failed: false });
  const products = result.key === requestKey ? result.products : [];
  const loading = savedSelection === null || (selection.length > 0 && result.key !== requestKey);
  const failed = selection.length > 0 && result.key === requestKey && result.failed;

  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    async function loadProducts() {
      try {
        const response = await fetch("/api/products/compare?ids=" + encodeURIComponent(selection), { signal: controller.signal });
        if (!response.ok) throw new Error("Comparison request failed");
        const body = await response.json();
        if (!controller.signal.aborted) setResult({ key: requestKey, products: body.data ?? [], failed: false });
      } catch {
        if (!controller.signal.aborted) setResult({ key: requestKey, products: [], failed: true });
      }
    }
    void loadProducts();
    return () => controller.abort();
  }, [selection, requestKey]);

  const specifications = useMemo(() => {
    const rows = new Map<string, string>();
    for (const product of products) {
      for (const specification of product.specifications) {
        if (!rows.has(specification.keyEn)) rows.set(specification.keyEn, locale === "ar" ? specification.keyAr || specification.keyEn : specification.keyEn);
      }
    }
    return Array.from(rows, ([key, label]) => ({ key, label }));
  }, [products, locale]);
  const money = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", { style: "currency", currency: "EGP", minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const numbers = new Intl.NumberFormat(locale);
  const rating = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const cellClass = "border-b border-line px-6 py-5 align-top text-steel";
  const labelClass = "border-b border-line bg-paper/60 px-6 py-5 text-start align-top text-xs font-medium text-ink";

  return (
    <div className="page-shell">
      <Link href="/#collection" className="inline-flex min-h-10 items-center gap-2 text-xs font-medium text-steel transition-colors hover:text-accent">
        <StorefrontIcon name="arrow" width="15" height="15" className="rotate-180 rtl:rotate-0" />
        {t("backToShop")}
      </Link>
      <div className="mt-5 mb-8">
        <p className="eyebrow">{t("details")}</p>
        <h1 className="page-heading mt-3">{t("compareTitle")}</h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-steel">{t("compareDescription")}</p>
      </div>

      {loading ? (
        <div className="surface-card flex min-h-60 flex-col items-center justify-center gap-5 text-center" role="status" aria-live="polite">
          <span className="flex size-16 animate-pulse items-center justify-center rounded-full bg-mist text-accent"><StorefrontIcon name="compare" /></span>
          <p className="text-sm text-steel">{t("compareLoading")}</p>
        </div>
      ) : failed ? (
        <div className="surface-card flex min-h-72 flex-col items-center justify-center text-center" role="alert">
          <h2 className="font-display text-2xl font-medium tracking-tight">{t("errorTitle")}</h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-steel">{t("errorDescription")}</p>
          <button type="button" onClick={() => setRevision((current) => current + 1)} className="button-primary mt-6">{t("tryAgain")}</button>
        </div>
      ) : products.length === 0 ? (
        <div className="surface-card flex min-h-80 flex-col items-center justify-center text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-mist text-accent"><StorefrontIcon name="compare" /></span>
          <p className="mt-6 max-w-md text-sm leading-7 text-steel">{t("compareEmpty")}</p>
          <Link href="/#collection" className="button-primary mt-6">{t("browseCollection")}<StorefrontIcon name="arrow" width="16" height="16" className="rtl:rotate-180" /></Link>
        </div>
      ) : (
        <div className="surface-card overflow-hidden p-0">
          <div className="overflow-x-auto" role="region" aria-label={t("compareTitle")} tabIndex={0}>
            <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: 180 + products.length * 230 }}>
              <caption className="sr-only">{t("compareTitle")}</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-44 border-b border-line bg-paper/60 px-6 py-7 text-start align-bottom text-xs font-medium text-steel">{t("feature")}</th>
                  {products.map((product) => (
                    <th scope="col" key={product.id} className="border-b border-line px-6 py-7 text-start align-top">
                      <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-steel">{locale === "ar" ? product.category.nameAr || product.category.nameEn : product.category.nameEn}</p>
                      <Link className="group inline-flex items-start gap-2 font-display text-lg font-medium leading-snug tracking-tight text-ink transition-colors hover:text-accent" href={"/products/" + product.slug}>
                        {locale === "ar" ? product.nameAr || product.nameEn : product.nameEn}
                        <StorefrontIcon name="arrow" width="16" height="16" className="mt-1 shrink-0 text-accent rtl:rotate-180" />
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className={labelClass}>{t("brand")}</th>
                  {products.map((product) => <td key={product.id} className={cellClass}>{product.brand?.name ?? "—"}</td>)}
                </tr>
                <tr>
                  <th scope="row" className={labelClass}>{t("price")}</th>
                  {products.map((product) => <td key={product.id} className={cellClass}><span className="font-display text-lg font-medium tracking-tight text-ink">{product.variants[0] ? money.format(Number(product.variants[0].salePrice ?? product.variants[0].price)) : "—"}</span></td>)}
                </tr>
                <tr>
                  <th scope="row" className={labelClass}>{t("rating")}</th>
                  {products.map((product) => <td key={product.id} className={cellClass}>{productText("reviewSummary", { average: rating.format(Number(product.averageRating)), count: product.reviewCount })}</td>)}
                </tr>
                <tr>
                  <th scope="row" className={labelClass}>{t("availability")}</th>
                  {products.map((product) => {
                    const stock = product.variants[0]?.stock ?? 0;
                    return <td key={product.id} className={cellClass}><span className={"inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium " + (stock > 0 ? "bg-mist text-accent" : "bg-alert/10 text-alert")}><span className="size-1.5 rounded-full bg-current" />{t(stock > 0 ? "inStock" : "outOfStock")}{stock > 0 && <span className="opacity-65">({numbers.format(stock)})</span>}</span></td>;
                  })}
                </tr>
                {specifications.map(({ key, label }) => (
                  <tr key={key} className="last:[&_td]:border-b-0 last:[&_th]:border-b-0">
                    <th scope="row" className={labelClass}>{label}</th>
                    {products.map((product) => {
                      const specification = product.specifications.find((item) => item.keyEn === key);
                      return <td key={product.id} className={cellClass}>{specification ? locale === "ar" ? specification.valueAr || specification.valueEn : specification.valueEn : "—"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
