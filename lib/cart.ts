import { prisma } from "@/lib/prisma";

// كارت اليوزر بيتعمل أول مرة يحتاجها بس (lazy) — مش وقت التسجيل.
// أغلب اليوزرز مش هيستخدموا الكارت أبدًا، فمفيش داعي نعمل صف فاضي لكل واحد.
export async function getOrCreateCart(userId: string) {
  const existing = await prisma.cart.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.cart.create({ data: { userId } });
}
