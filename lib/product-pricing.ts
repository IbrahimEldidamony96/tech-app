import type { Prisma } from "@/app/generated/prisma/client";

type VariantPrice = {
  price: Prisma.Decimal;
  salePrice?: Prisma.Decimal | null;
  saleStartsAt?: Date | null;
  saleEndsAt?: Date | null;
};

export function isSaleActive(variant: VariantPrice, now = new Date()) {
  if (!variant.salePrice || variant.salePrice.gte(variant.price)) return false;
  if (variant.saleStartsAt && variant.saleStartsAt > now) return false;
  if (variant.saleEndsAt && variant.saleEndsAt < now) return false;
  return true;
}

export function effectiveVariantPrice(variant: VariantPrice, now = new Date()) {
  return isSaleActive(variant, now) ? variant.salePrice! : variant.price;
}
