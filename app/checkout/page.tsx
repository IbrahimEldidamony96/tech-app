import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCartForUser } from "@/lib/queries/cart";
import { localized } from "@/lib/locale";
import { CheckoutForm } from "@/components/checkout-form";
import { GuestCartHandoff } from "@/components/guest-cart-handoff";
import type { AppLocale } from "@/i18n/request";

export default async function CheckoutPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?next=/checkout");
  }

  const store = await getTranslations("Storefront");
  const [cart, addresses, user] = await Promise.all([
    getCartForUser(session.user.id),
    prisma.address.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { loyaltyPoints: true } }),
  ]);

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
      <GuestCartHandoff hasServerItems={items.length > 0}>
        <CheckoutForm items={items} subtotal={cart.subtotal} addresses={addresses} loyaltyPoints={user?.loyaltyPoints ?? 0} />
      </GuestCartHandoff>
    </div>
  );
}
