import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";

// Bosta doesn't expose a public real-time "calculate delivery fee" endpoint —
// checked their docs (docs.bosta.co/api), their public pricing page, and the
// third-party SDKs that wrap their API. Their business pricing is a
// negotiated flat-rate card per governorate/zone tier that's set up during
// onboarding (e.g. "15 EGP/order if you ship 50+/month"), not something you
// query per-shipment. So we keep our own per-governorate fee table
// (ShippingRate, keyed to Bosta's real cityId from GET /cities — see
// lib/bosta.ts) and the admin fills in whatever Bosta actually quoted for
// each governorate from /admin/shipping-rates.

/** Orders below this subtotal pay the governorate's base fee; at or above it,
 * shipping is free. Kept as a business promotion layered on top of the real
 * Bosta-tied base fee, separate from Bosta's own pricing. Configurable via
 * env since the right cutoff depends entirely on your catalog's price
 * range. */
export const FREE_SHIPPING_THRESHOLD = new Prisma.Decimal(
  process.env.FREE_SHIPPING_THRESHOLD || "3000",
);

/** Used only when the admin hasn't configured a ShippingRate for a
 * governorate yet — keeps checkout working instead of hard-failing, while
 * still being obviously a placeholder (configurable via env so it can be set
 * to whatever Bosta actually quoted before the admin finishes filling in the
 * per-governorate table). */
export const DEFAULT_SHIPPING_FEE = new Prisma.Decimal(
  process.env.DEFAULT_SHIPPING_FEE || "75",
);

/**
 * Looks up the configured fee for a Bosta governorate. Uses the plain
 * `prisma` singleton, so only call this OUTSIDE a $transaction (e.g. the
 * checkout shipping-cost preview endpoint). Inside the checkout transaction,
 * query `tx.shippingRate.findUnique()` directly instead — see
 * app/api/checkout/route.ts — so the read stays inside the same transaction
 * as the rest of checkout instead of racing an admin edit mid-checkout.
 */
export async function getShippingFeeForCity(
  bostaCityId: string | null | undefined,
): Promise<Prisma.Decimal> {
  if (!bostaCityId) return DEFAULT_SHIPPING_FEE;

  const rate = await prisma.shippingRate.findUnique({
    where: { bostaCityId },
  });

  return rate && rate.isActive ? rate.fee : DEFAULT_SHIPPING_FEE;
}

/**
 * Pure arithmetic, no DB access — so the checkout transaction and the
 * shipping-cost preview endpoint always apply the exact same free-shipping
 * rule against the same base fee, and never drift apart.
 */
export function computeShippingCost(
  baseFee: Prisma.Decimal,
  subtotal: Prisma.Decimal,
): { shippingCost: Prisma.Decimal; freeShippingApplied: boolean } {
  const freeShippingApplied = subtotal.gte(FREE_SHIPPING_THRESHOLD);
  return {
    shippingCost: freeShippingApplied ? new Prisma.Decimal(0) : baseFee,
    freeShippingApplied,
  };
}
