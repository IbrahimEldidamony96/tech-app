import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { getCartForUser } from "@/lib/queries/cart";
import { localized } from "@/lib/locale";
import { CartItems } from "@/components/cart-items";
import { GuestCart } from "@/components/guest-cart";
import type { AppLocale } from "@/i18n/request";

export default async function CartPage() {
  const session = await auth();
  const store = await getTranslations("Storefront");
  if (!session?.user) {
    const t = await getTranslations("Cart");
    return (
      <div className="page-shell">
        <p className="eyebrow">{store("yourBag")}</p>
        <h1 className="page-heading mt-3">{t("title")}</h1>
        <GuestCart />
      </div>
    );
  }

  const cart = await getCartForUser(session.user.id);
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("Cart");

  // Decimal -> number لطبقة الـ UI، ونحول شكل الـ optionValues لسطر واحد
  // مقروء ("Black / 128GB") بدل مصفوفة متداخلة — باللغة الحالية
  const items = cart.items.map((item) => ({
    id: item.id,
    quantity: item.quantity,
    variant: {
      id: item.variant.id,
      sku: item.variant.sku,
      price: item.variant.price.toNumber(),
      stock: item.variant.stock,
      isActive: item.variant.isActive,
      optionSummary: item.variant.optionValues
        .map((ov) => localized(locale, ov.optionValue.valueEn, ov.optionValue.valueAr))
        .join(" / "),
      product: {
        id: item.variant.product.id,
        name: localized(locale, item.variant.product.nameEn, item.variant.product.nameAr),
        slug: item.variant.product.slug,
        isActive: item.variant.product.isActive,
        images: item.variant.product.images,
      },
    },
  }));

  return (
    <div className="page-shell">
      <p className="eyebrow">{store("yourBag")}</p>
      <h1 className="page-heading mt-3">{t("title")}</h1>

      {items.length === 0 ? (
        <div className="surface-card mt-9 flex min-h-80 flex-col items-center justify-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-mist text-accent" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 8h14l1 13H4L5 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></svg></div>
          <p className="font-display text-xl font-semibold text-ink">{t("empty")}</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-steel">{store("emptyCartDescription")}</p>
          <Link href="/" className="button-primary mt-6">
            {t("browseProducts")}
          </Link>
        </div>
      ) : (
        <CartItems initialItems={items} />
      )}
    </div>
  );
}
