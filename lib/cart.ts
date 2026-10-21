import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

// كارت اليوزر بيتعمل أول مرة يحتاجها بس (lazy) — مش وقت التسجيل.
// أغلب اليوزرز مش هيستخدموا الكارت أبدًا، فمفيش داعي نعمل صف فاضي لكل واحد.
export async function getOrCreateCart(userId: string) {
  // Native ON CONFLICT avoids an error/rollback during concurrent first access.
  // Skipping an existing row also preserves its last-activity timestamp.
  await prisma.cart.createMany({ data: { userId }, skipDuplicates: true });
  return prisma.cart.findUniqueOrThrow({ where: { userId } });
}

export async function withLockedCart<T>(userId: string, mutate: (tx: Prisma.TransactionClient, cartId: string) => Promise<T>) {
  const cart = await getOrCreateCart(userId);
  return prisma.$transaction(async tx => {
    // Checkout takes this same parent lock before reading or clearing items.
    await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${cart.id} FOR UPDATE`;
    return mutate(tx, cart.id);
  }, { timeout: 15000 });
}
