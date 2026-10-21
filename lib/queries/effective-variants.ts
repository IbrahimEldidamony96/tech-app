import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// All catalog SQL uses the v alias. Bind one clock value for the full request.
export function effectivePriceSql(now: Date) {
  return Prisma.sql`CASE WHEN v."salePrice" IS NOT NULL AND v."salePrice" < v.price
    AND (v."saleStartsAt" IS NULL OR v."saleStartsAt" <= ${now})
    AND (v."saleEndsAt" IS NULL OR v."saleEndsAt" >= ${now})
    THEN v."salePrice" ELSE v.price END`;
}

export async function cheapestVariantIds(productIds: string[], now = new Date()) {
  if (!productIds.length) return [];
  return prisma.$queryRaw<{ id: string; productId: string }[]>(Prisma.sql`
    SELECT DISTINCT ON (v."productId") v.id, v."productId"
    FROM "ProductVariant" v
    WHERE v."productId" IN (${Prisma.join(productIds)}) AND v."isActive" = true
    ORDER BY v."productId", ${effectivePriceSql(now)} ASC, v.id ASC
  `);
}
