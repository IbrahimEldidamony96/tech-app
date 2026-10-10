import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCartForUser } from "@/lib/queries/cart";
import { localized } from "@/lib/locale";
import { CheckoutForm } from "@/components/checkout-form";
import { GuestCheckoutForm } from "@/components/guest-checkout-form";
import type { AppLocale } from "@/i18n/request";

export default async function CheckoutPage() {
  const session = await auth();
  const store = await getTranslations("Storefront");
  if (!session?.user) {
    const t = await getTranslations("Checkout");
    return (
      <div className="page-shell">
        <p className="eyebrow">{store("secureCheckout")}</p>
        <h1 className="page-heading mt-3">{t("title")}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-steel">{store("checkoutDescription")}</p>
        <GuestCheckoutForm />
      </div>
    );
  }

  const [cart, addresses, user] = await Promise.all([
    getCartForUser(session.user.id),
    prisma.address.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { loyaltyPoints: true } }),
  ]);

  if (cart.items.length === 0) redirect("/cart");

  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("Checkout");

  const items = cart.items.map((item) => ({
    id: item.id,
    quantity: item.quantity,
    name: localized(locale, item.variant.product.nameEn, item.variant.product.nameAr),
    price: item.variant.price.toNumber(),
  }));

  return (
    <div className="page-shell">
      <p className="eyebrow">{store("secureCheckout")}</p>
      <h1 className="page-heading mt-3">{t("title")}</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-steel">{store("checkoutDescription")}</p>
      <CheckoutForm items={items} subtotal={cart.subtotal} addresses={addresses} loyaltyPoints={user?.loyaltyPoints ?? 0} />
    </div>
  );
}
