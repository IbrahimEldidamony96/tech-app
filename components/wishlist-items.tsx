"use client";

import { useRef, useState } from "react";
import { requestFailureMessage } from "@/lib/request-error";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";

type Item = {
  id: string;
  product: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    image: string | null;
    price: number | null;
    stock: number;
  };
};

export function WishlistItems({ initialItems }: { initialItems: Item[] }) {
  const t = useTranslations("Wishlist");
  const store = useTranslations("Storefront");
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  // toggle بتاعت Phase 4: بما إن العنصر أصلاً محفوظ، الضغطة هنا هتشيله —
  // بنشيله من الواجهة فورًا (optimistic) من غير ما نستنى رد السيرفر
  async function remove(productId: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/wishlist", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }),
      });
      if (!response.ok) throw new Error();
      setItems(previous => previous.filter(item => item.product.id !== productId));
    } catch { setError(requestFailureMessage()); }
    finally { pending.current = false; setBusy(false); }
  }

  if (items.length === 0) {
    return (
      <div className="surface-card mt-9 flex min-h-80 flex-col items-center justify-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-mist text-accent" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></div>
        <p className="font-display text-xl font-semibold text-ink">{t("empty")}</p>
        <p className="mt-2 max-w-sm text-sm leading-6 text-steel">{store("emptyWishlistDescription")}</p>
        <Link href="/" className="button-primary mt-6">
          {t("browseProducts")}
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {error && <li role="alert" className="text-sm text-alert sm:col-span-2 lg:col-span-3">{error}</li>}
      {items.map((item) => (
        <li key={item.id} className="overflow-hidden rounded-3xl border border-line bg-surface p-4">
          <Link href={`/products/${item.product.slug}`} className="relative block aspect-[4/3] overflow-hidden rounded-2xl bg-mist">
            {item.product.image && (
              <Image
                src={item.product.image}
                alt={item.product.name}
                fill
                className="object-contain p-6 transition-transform duration-300 hover:scale-105"
                sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 360px"
              />
            )}
            {!item.product.image && <span className="flex h-full items-center justify-center text-3xl text-accent/40" aria-hidden="true">♡</span>}
          </Link>
          <div className="p-2 pt-5">
            <Link
              href={`/products/${item.product.slug}`}
              className="font-display text-base font-semibold text-ink hover:text-accent"
            >
              {item.product.name}
            </Link>
            <p className="mt-2 text-sm font-semibold tabular-nums text-ink">
              {item.product.price !== null ? `EGP ${item.product.price.toLocaleString()}` : "—"}
            </p>
            {(!item.product.isActive || item.product.stock === 0) && (
              <p className="mt-1 text-xs text-alert">{t("unavailable")}</p>
            )}
            <button
              type="button"
              onClick={() => remove(item.product.id)}
              disabled={busy}
              className="mt-4 text-xs text-steel underline decoration-line underline-offset-4 hover:text-alert"
            >
              {t("removeItem")}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
