import { Prisma } from "@/app/generated/prisma/client";

type CartLine = {
  productId: string;
  quantity: number;
  lineTotal: Prisma.Decimal;
};

type BundleOffer = {
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: Prisma.Decimal;
  items: readonly { productId: string; quantity: number }[];
};

const ZERO = new Prisma.Decimal(0);

/**
 * Apply at most ONE bundle set per order (the best available offer wins in
 * checkout). Each required product contributes exactly its required quantity,
 * not every unit of that product, and never unrelated cart lines.
 *
 * A product may have several variants at different prices. Allocate the
 * cheapest eligible units first. This is deterministic and prevents an extra
 * expensive variant from silently increasing the promotion's eligible base.
 * Repeated quantities do not trigger repeated bundle discounts.
 */
export function calculateBundleDiscount(
  bundle: BundleOffer,
  cartLines: readonly CartLine[],
): Prisma.Decimal {
  if (bundle.items.length === 0 || bundle.discountValue.lte(ZERO)) return ZERO;
  let eligibleSubtotal = ZERO;

  for (const requirement of bundle.items) {
    if (!Number.isSafeInteger(requirement.quantity) || requirement.quantity <= 0) return ZERO;

    const eligibleLines = cartLines
      .filter((line) => line.productId === requirement.productId && line.quantity > 0)
      .sort((a, b) =>
        a.lineTotal.div(a.quantity).comparedTo(b.lineTotal.div(b.quantity)),
      );

    const availableQuantity = eligibleLines.reduce((sum, line) => sum + line.quantity, 0);
    if (availableQuantity < requirement.quantity) return ZERO;

    let remainingQuantity = requirement.quantity;
    for (const line of eligibleLines) {
      if (remainingQuantity === 0) break;
      const selectedQuantity = Math.min(remainingQuantity, line.quantity);
      eligibleSubtotal = eligibleSubtotal.add(
        line.lineTotal.div(line.quantity).mul(selectedQuantity),
      );
      remainingQuantity -= selectedQuantity;
    }
  }

  const requestedDiscount =
    bundle.discountType === "PERCENTAGE"
      ? eligibleSubtotal.mul(bundle.discountValue).div(100)
      : bundle.discountValue;

  return Prisma.Decimal.min(
    eligibleSubtotal,
    requestedDiscount.toDecimalPlaces(2),
  );
}
