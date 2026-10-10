"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type CartItem = {
  id: string;
  quantity: number;
  variant: {
    id: string;
    sku: string;
    price: number;
    stock: number;
    isActive: boolean;
    optionSummary: string;
    product: { id: string; name: string; slug: string; isActive: boolean; images: { url: string }[] };
  };
};

export function CartItems({ initialItems }: { initialItems: CartItem[] }) {
  const router = useRouter();
  const t = useTranslations("Cart");
  const store = useTranslations("Storefront");
  const [items, setItems] = useState(initialItems);

  const subtotal = items.reduce((sum, item) => sum + item.variant.price * item.quantity, 0);

  // Optimistic update: نغيّر الواجهة فورًا، ولو السيرفر رفض (مخزون
  // اتغير من تاب تاني مثلاً) بنعمل router.refresh() يجيب الحالة الحقيقية
  async function updateQuantity(itemId: string, quantity: number) {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, quantity } : i)));

    const res = await fetch(`/api/cart/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });

    if (!res.ok) router.refresh();
  }

  async function removeItem(itemId: string) {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    await fetch(`/api/cart/items/${itemId}`, { method: "DELETE" });
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <div className="surface-card mt-9 flex min-h-80 flex-col items-center justify-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-mist text-accent" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 8h14l1 13H4L5 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></svg></div>
        <p className="font-display text-xl font-semibold text-ink">{t("empty")}</p>
        <p className="mt-2 max-w-sm text-sm leading-6 text-steel">{store("emptyCartDescription")}</p>
        <Link href="/" className="button-primary mt-6">
          {t("browseProducts")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-9 grid items-start gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
      <ul className="surface-card divide-y divide-line">
        {items.map((item) => {
          const image = item.variant.product.images[0];
          const unavailable = !item.variant.isActive || !item.variant.product.isActive;
          const maxQty = Math.min(10, item.variant.stock);

          return (
            <li key={item.id} className="flex gap-4 py-6 first:pt-0 last:pb-0 sm:gap-5">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-mist sm:h-28 sm:w-28">
                {image && (
                  <Image
                    src={image.url}
                    alt={item.variant.product.name}
                    fill
                    className="object-contain p-3"
                    sizes="112px"
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/products/${item.variant.product.slug}`}
                  className="font-display text-base font-semibold leading-6 text-ink hover:text-accent"
                >
                  {item.variant.product.name}
                </Link>
                {item.variant.optionSummary && (
                  <p className="mt-1 text-xs leading-5 text-steel">{item.variant.optionSummary}</p>
                )}
                <p className="mt-2 text-sm font-semibold tabular-nums text-ink">EGP {item.variant.price.toLocaleString()}</p>

                {unavailable && <p className="mt-1 text-xs text-alert">{t("unavailable")}</p>}

                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <div className="flex items-center overflow-hidden rounded-full border border-line bg-paper">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                      className="flex h-9 w-9 items-center justify-center text-steel transition-colors hover:bg-mist hover:text-ink"
                      aria-label={t("decreaseQuantity")}
                    >
                      −
                    </button>
                    <span className="w-7 text-center text-xs font-medium tabular-nums text-ink">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, Math.min(maxQty, item.quantity + 1))}
                      className="flex h-9 w-9 items-center justify-center text-steel transition-colors hover:bg-mist hover:text-ink"
                      aria-label={t("increaseQuantity")}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="py-2 text-xs text-steel underline decoration-line underline-offset-4 transition-colors hover:text-alert"
                  >
                    {t("remove")}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="surface-card lg:sticky lg:top-28">
        <p className="eyebrow">{store("yourBag")}</p>
        <div className="mt-5 flex items-center justify-between gap-4 border-b border-line pb-6">
          <p className="text-sm text-steel">{t("subtotal")}</p>
          <p className="text-xl font-semibold tracking-tight tabular-nums text-ink">EGP {subtotal.toLocaleString()}</p>
        </div>
        <Link href="/checkout" className="button-primary mt-6 w-full">
          {t("proceedToCheckout")}
        </Link>
        <Link href="/" className="mt-4 block text-center text-xs font-medium text-steel hover:text-accent">{store("backToShop")}</Link>
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-steel"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>{store("secureCheckout")}</p>
      </aside>
    </div>
  );
}
