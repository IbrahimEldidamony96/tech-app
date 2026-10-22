import type { Prisma, LoyaltyTransactionType } from "@/app/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export const LOYALTY_EGP_PER_POINT = 1;
export const LOYALTY_EARN_EGP_STEP = 10;

export class InsufficientLoyaltyPointsError extends Error {
  constructor() { super("INSUFFICIENT_LOYALTY_POINTS"); }
}

export async function changeLoyaltyPoints(
  tx: Tx,
  input: {
    userId: string;
    points: number;
    type: LoyaltyTransactionType;
    referenceType?: string;
    referenceId?: string;
    note?: string;
    idempotencyKey?: string;
    // Compensations can create a points debt if a customer already spent
    // points previously earned on an order that was later returned.
    allowNegativeBalance?: boolean;
  },
) {
  if (!Number.isInteger(input.points) || input.points === 0) return null;
  if (input.idempotencyKey) {
    const existing = await tx.loyaltyTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
  }

  if (input.points < 0 && !input.allowNegativeBalance) {
    const claimed = await tx.user.updateMany({
      where: { id: input.userId, loyaltyPoints: { gte: Math.abs(input.points) } },
      data: { loyaltyPoints: { increment: input.points } },
    });
    if (claimed.count !== 1) throw new InsufficientLoyaltyPointsError();
  } else {
    await tx.user.update({
      where: { id: input.userId },
      data: { loyaltyPoints: { increment: input.points } },
    });
  }

  const user = await tx.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { loyaltyPoints: true },
  });

  return tx.loyaltyTransaction.create({
    data: {
      userId: input.userId,
      type: input.type,
      points: input.points,
      balanceAfter: user.loyaltyPoints,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

export function pointsEarnedFromOrder(totalEgp: number) {
  return Math.max(0, Math.floor(totalEgp / LOYALTY_EARN_EGP_STEP));
}

export const REFERRAL_REWARD_REFERRER = 100;
export const REFERRAL_REWARD_NEW_USER = 50;
