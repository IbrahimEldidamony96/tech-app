import { Prisma } from "@/app/generated/prisma/client";

const ZERO = new Prisma.Decimal(0);
export const cents = (amount: Prisma.Decimal) => amount.mul(100).toDecimalPlaces(0).toNumber();

type OrderPriceSnapshot = {
  subtotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  total: Prisma.Decimal;
};
type ReturnLine = {
  quantity: number;
  orderItem: { quantity: number; totalPrice: Prisma.Decimal };
};

/**
 * Refunds never include shipping. Distribute the original order's discount
 * (including redeemed points) proportionally over the purchased merchandise.
 * Historical order-item prices are authoritative, not current catalog prices.
 */
export function maximumReturnRefund(
  order: OrderPriceSnapshot,
  items: readonly ReturnLine[],
): Prisma.Decimal {
  if (order.subtotal.lte(ZERO) || order.discount.lt(ZERO) || order.discount.gt(order.subtotal)) return ZERO;
  let grossReturned = ZERO;
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
        !Number.isSafeInteger(item.orderItem.quantity) || item.orderItem.quantity < item.quantity) return ZERO;
    grossReturned = grossReturned.add(
      item.orderItem.totalPrice.mul(item.quantity).div(item.orderItem.quantity),
    );
  }
  const netMerchandise = order.subtotal.sub(order.discount);
  return Prisma.Decimal.min(
    netMerchandise,
    grossReturned.mul(netMerchandise).div(order.subtotal).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
  );
}

export function refundBalance(
  paid: Prisma.Decimal,
  confirmed: Prisma.Decimal,
  requested: Prisma.Decimal,
) {
  return paid.sub(confirmed).sub(requested);
}

/** Full paid amount refunded == REFUNDED; any smaller amount == PARTIALLY_REFUNDED. */
export function paymentStatusAfterRefund(
  paid: Prisma.Decimal,
  totalConfirmed: Prisma.Decimal,
): "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED" {
  if (totalConfirmed.gte(paid)) return "REFUNDED";
  return totalConfirmed.gt(ZERO) ? "PARTIALLY_REFUNDED" : "PAID";
}

export function proratedPoints(original: number, amount: Prisma.Decimal, max: Prisma.Decimal) {
  if (original <= 0 || amount.lte(ZERO) || max.lte(ZERO)) return 0;
  if (amount.gte(max)) return original;
  return Math.min(original, Math.max(0,
    new Prisma.Decimal(original).mul(amount).div(max).floor().toNumber(),
  ));
}
