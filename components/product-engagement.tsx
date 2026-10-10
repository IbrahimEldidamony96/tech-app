"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { StorefrontIcon } from "@/components/storefront-icon";

function readCompareIds() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("compareProductIds") ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  }
  catch { return []; }
}

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

export function ProductEngagement({ productId, signedIn, outOfStock }: { productId: string; signedIn: boolean; outOfStock: boolean }) {
  const router = useRouter();
  const t = useTranslations("Storefront");
  const savedCompare = useSyncExternalStore(subscribeToCompare, compareSnapshot, () => "[]");
  const compared = (() => {
    try { const ids: unknown = JSON.parse(savedCompare); return Array.isArray(ids) && ids.includes(productId); }
    catch { return false; }
  })();
  const [alerted, setAlerted] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (signedIn) void fetch("/api/recently-viewed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId }) }).catch(() => {});
    else {
      try {
        const recent = JSON.parse(localStorage.getItem("recentProductIds") ?? "[]") as string[];
        localStorage.setItem("recentProductIds", JSON.stringify([productId, ...recent.filter((id) => id !== productId)].slice(0, 20)));
      } catch { /* ignore invalid local storage */ }
    }
  }, [productId, signedIn]);

  function toggleCompare() {
    const ids = readCompareIds();
    const next = ids.includes(productId) ? ids.filter((id) => id !== productId) : [...ids, productId].slice(-4);
    try {
      localStorage.setItem("compareProductIds", JSON.stringify(next));
      window.dispatchEvent(new Event("compare-products-changed"));
    } catch { setMessage(t("alertFailed")); }
  }

  async function stockAlert() {
    if (!signedIn) { router.push("/login"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/stock-alerts", { method: alerted ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId }) });
      if (!res.ok) { setMessage(t("alertFailed")); return; }
      setAlerted(!alerted);
      setMessage(t(alerted ? "alertRemoved" : "alertSaved"));
    } catch { setMessage(t("alertFailed")); }
    finally { setBusy(false); }
  }

  return <div className="mt-5 flex flex-wrap items-center gap-2">
    <button type="button" onClick={toggleCompare} aria-pressed={compared} className="button-secondary px-4 text-xs"><StorefrontIcon name="compare" width="15" height="15" />{t(compared ? "removeCompare" : "compare")}</button>
    {compared && <Link href="/compare" className="inline-flex min-h-11 items-center px-3 text-xs font-medium text-accent hover:underline">{t("openCompare")}</Link>}
    {outOfStock ? <button type="button" onClick={stockAlert} disabled={busy} className="button-primary px-4 text-xs">{t(busy ? "loading" : alerted ? "cancelStockAlert" : "notifyStock")}</button> : null}
    {message ? <span role="status" className="w-full text-xs text-steel">{message}</span> : null}
  </div>;
}
