import { prisma } from "@/lib/prisma";
import { getOrCreateCart } from "@/lib/cart";
import { Prisma } from "@/app/generated/prisma/client";
import { effectiveVariantPrice } from "@/lib/product-pricing";

export async function getCartForUser(userId: string) {
  const cart = await getOrCreateCart(userId);

  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      quantity: true,
      variant: {
        select: {
          id: true,
          sku: true,
          price: true,
          salePrice: true,
          saleStartsAt: true,
          saleEndsAt: true,
          stock: true,
          isActive: true,
          product: {
            select: {
              id: true,
              nameEn: true,
              nameAr: true,
              slug: true,
              isActive: true,
              images: { where: { isPrimary: true }, take: 1, select: { url: true } },
            },
          },
          optionValues: { select: { optionValue: { select: { valueEn: true, valueAr: true } } } },
        },
      },
    },
  });

  // One pricing policy for cart, shipping preview, and checkout.
  // The checkout transaction still re-prices under lock at order creation.
  const now = new Date();
  const pricedItems = items.map((item) => ({
    ...item,
    effectivePrice: effectiveVariantPrice(item.variant, now),
  }));
  const subtotal = pricedItems.reduce(
    (sum, item) => sum.add(item.effectivePrice.mul(item.quantity)),
    new Prisma.Decimal(0),
  ).toNumber();
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return { id: cart.id, items: pricedItems, subtotal, itemCount };
}
