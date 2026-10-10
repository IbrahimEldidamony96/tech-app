import type { Prisma } from "@/app/generated/prisma/client";
import { createNotification } from "@/lib/notifications";

type Tx = Prisma.TransactionClient;

export async function notifyStockAvailable(tx: Tx, variantId: string) {
  const variant = await tx.productVariant.findUnique({
    where: { id: variantId },
    select: { stock: true, product: { select: { id: true, slug: true, nameEn: true } } },
  });
  if (!variant || variant.stock <= 0) return;
  const alerts = await tx.stockAlert.findMany({
    where: { productId: variant.product.id, notifiedAt: null },
    select: { id: true, userId: true },
  });
  if (!alerts.length) return;
  for (const alert of alerts) {
    await createNotification(tx, {
      userId: alert.userId,
      type: "STOCK",
      title: "Back in stock",
      message: `${variant.product.nameEn} is available again.`,
      link: `/products/${variant.product.slug}`,
    });
  }
  await tx.stockAlert.updateMany({
    where: { id: { in: alerts.map((a) => a.id) }, notifiedAt: null },
    data: { notifiedAt: new Date() },
  });
}
