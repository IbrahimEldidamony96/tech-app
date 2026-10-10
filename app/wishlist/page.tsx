import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { getWishlistForUser } from "@/lib/queries/wishlist";
import { localized } from "@/lib/locale";
import { WishlistItems } from "@/components/wishlist-items";
import type { AppLocale } from "@/i18n/request";

export default async function WishlistPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/wishlist");

  const items = await getWishlistForUser(session.user.id);
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("Wishlist");
  const store = await getTranslations("Storefront");

  // نفس تحويل Decimal -> number المتكرر من صفحات الكارت والمنتج
  const mapped = items.map((item) => ({
    id: item.id,
    product: {
      id: item.product.id,
      name: localized(locale, item.product.nameEn, item.product.nameAr),
      slug: item.product.slug,
      isActive: item.product.isActive,
      image: item.product.images[0]?.url ?? null,
      price: item.product.variants[0]?.price.toNumber() ?? null,
      stock: item.product.variants[0]?.stock ?? 0,
    },
  }));

  return (
    <div className="page-shell">
      <p className="eyebrow">{store("savedForLater")}</p>
      <h1 className="page-heading mt-3">{t("title")}</h1>
      <WishlistItems initialItems={mapped} />
    </div>
  );
}
