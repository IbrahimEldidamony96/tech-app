import { prisma } from "@/lib/prisma";
import { getOrCreateCart } from "@/lib/cart";

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

  const subtotal = items.reduce((sum, item) => sum + item.variant.price.toNumber() * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return { id: cart.id, items, subtotal, itemCount };
}
