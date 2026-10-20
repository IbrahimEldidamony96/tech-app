import { Prisma } from "@/app/generated/prisma/client";
import { changeLoyaltyPoints } from "@/lib/loyalty";
import { proratedPoints } from "@/lib/refund-accounting";

/**
 * Only invoke inside the SAME transaction after holding the parent Order row
 * FOR UPDATE. Both return-refund confirmation and shipment-return flow call
 * this function. It converges to the appropriate TARGET balance rather than
 * subtracting the same reward each time another partial refund arrives.
 */
export async function compensateOrderLoyalty(
  tx: Prisma.TransactionClient,
  orderId: string,
  options: { returnedShipment?: boolean } = {},
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      userId: true,
      subtotal: true,
      discount: true,
      total: true,
      loyaltyPointsRedeemed: true,
    },
  });
  if (!order.userId) return;
  const merchantNet = Prisma.Decimal.max(0, order.subtotal.sub(order.discount));
  const refunds = await tx.refund.aggregate({
    where: { orderId, status: "CONFIRMED" },
    _sum: { amount: true },
  });
  const refunded = options.returnedShipment
    ? merchantNet
    : refunds._sum.amount ?? new Prisma.Decimal(0);

  const fullyReturned = options.returnedShipment ||
    (merchantNet.gt(0) && refunded.gte(merchantNet));

  const earned = await tx.loyaltyTransaction.aggregate({
    where: { userId: order.userId, type: "EARN", referenceType: "ORDER", referenceId: orderId },
    _sum: { points: true },
  });
  const originallyEarned = Math.max(0, earned._sum.points ?? 0);
  const earnTarget = fullyReturned
    ? originallyEarned
    : proratedPoints(originallyEarned, refunded, order.total);

  const earnReversed = await tx.loyaltyTransaction.aggregate({
    where: { userId: order.userId, referenceType: "ORDER_EARN_REVERSAL", referenceId: orderId },
    _sum: { points: true },
  });
  const earnDelta = earnTarget + (earnReversed._sum.points ?? 0);
  if (earnDelta > 0) {
    await changeLoyaltyPoints(tx, {
      userId: order.userId,
      points: -earnDelta,
      allowNegativeBalance: true,
      type: "ADJUSTMENT",
      referenceType: "ORDER_EARN_REVERSAL",
      referenceId: orderId,
      idempotencyKey: `earn-reversal:${orderId}:${earnTarget}`,
      note: "Revoked earned points for refunded/returned merchandise",
    });
  }

  const restorationTarget = fullyReturned
    ? order.loyaltyPointsRedeemed
    : proratedPoints(order.loyaltyPointsRedeemed, refunded, merchantNet);

  const restored = await tx.loyaltyTransaction.aggregate({
    where: { userId: order.userId, type: "REFUND", referenceType: "ORDER_REDEMPTION_RESTORE", referenceId: orderId },
    _sum: { points: true },
  });
  const restoreDelta = restorationTarget - (restored._sum.points ?? 0);
  if (restoreDelta > 0) {
    await changeLoyaltyPoints(tx, {
      userId: order.userId,
      points: restoreDelta,
      type: "REFUND",
      referenceType: "ORDER_REDEMPTION_RESTORE",
      referenceId: orderId,
      idempotencyKey: `redeem-restoration:${orderId}:${restorationTarget}`,
      note: "Proportional restoration of redeemed points",
    });
  }

  // Referral rewards are one-off, so only reverse them for a complete
  // merchandise refund or when the shipment never completed delivery.
  if (fullyReturned) {
    const rewards = await tx.loyaltyTransaction.findMany({
      where: {
        referenceId: orderId,
        type: "REFERRAL",
        referenceType: { in: ["REFERRED_ORDER", "FIRST_DELIVERED_ORDER"] },
        points: { gt: 0 },
      },
      select: { id: true, userId: true, points: true },
    });
    for (const reward of rewards) {
      await changeLoyaltyPoints(tx, {
        userId: reward.userId,
        points: -reward.points,
        allowNegativeBalance: true,
        type: "ADJUSTMENT",
        referenceType: "ORDER_REFERRAL_REVERSAL",
        referenceId: orderId,
        idempotencyKey: `referral-reversal:${reward.id}`,
        note: "Revoked referral reward for fully refunded/returned order",
      });
    }
  }
}
