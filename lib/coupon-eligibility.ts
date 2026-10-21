import { Prisma } from "@/app/generated/prisma/client";

type Line = { categoryId: string; brandId: string | null; lineTotal: Prisma.Decimal };

export function eligibleCouponSubtotal(
  lines: readonly Line[],
  coupon: { categoryId: string | null; brandId: string | null },
) {
  return lines.reduce((sum, line) =>
    (!coupon.categoryId || line.categoryId === coupon.categoryId) &&
    (!coupon.brandId || line.brandId === coupon.brandId)
      ? sum.add(line.lineTotal) : sum, new Prisma.Decimal(0));
}
