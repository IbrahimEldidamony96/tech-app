import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@/app/generated/prisma/client";
import { compensateOrderLoyalty } from "./order-loyalty-compensation";

type Entry = {
  id: string; userId: string; type: string; points: number;
  referenceType?: string; referenceId?: string; idempotencyKey?: string;
};
const d = (n: number) => new Prisma.Decimal(n);

/** A deliberately small fake transaction: write effects stay visible to the
 * next call, while the reference & balance queries behave like Prisma. */
function fakeTx(refundAmount: number) {
  const balances = new Map([["buyer", 0], ["referrer", 0]]);
  const entries: Entry[] = [
    { id: "earned", userId: "buyer", type: "EARN", points: 10, referenceType: "ORDER", referenceId: "order" },
    { id: "referral1", userId: "buyer", type: "REFERRAL", points: 50, referenceType: "FIRST_DELIVERED_ORDER", referenceId: "order" },
    { id: "referral2", userId: "referrer", type: "REFERRAL", points: 100, referenceType: "REFERRED_ORDER", referenceId: "order" },
  ];
  const matches = (row: Entry, where: Record<string, any>) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === "object" && "in" in v
        ? (v.in as unknown[]).includes((row as any)[k])
        : v && typeof v === "object" && "gt" in v
          ? Number((row as any)[k]) > Number(v.gt)
          : (row as any)[k] === v,
    );
  const tx = {
    order: {
      findUniqueOrThrow: async () => ({
        userId: "buyer", subtotal: d(100), discount: d(0), total: d(100), loyaltyPointsRedeemed: 20,
      }),
    },
    refund: {
      aggregate: async () => ({ _sum: { amount: d(refundAmount) } }),
    },
    loyaltyTransaction: {
      aggregate: async ({ where }: { where: Record<string, any> }) => ({
        _sum: { points: entries.filter((entry) => matches(entry, where)).reduce((sum, entry) => sum + entry.points, 0) || null },
      }),
      findMany: async ({ where }: { where: Record<string, any> }) =>
        entries.filter((entry) => matches(entry, where)),
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
        entries.find((entry) => entry.idempotencyKey === where.idempotencyKey) ?? null,
      create: async ({ data }: { data: any }) => {
        if (data.idempotencyKey && entries.some((x) => x.idempotencyKey === data.idempotencyKey)) {
          throw new Error("Duplicate idempotency key");
        }
        const value: Entry = { ...data, id: "new-" + entries.length };
        entries.push(value);
        return value;
      },
    },
    user: {
      update: async ({ where, data }: { where: { id: string }; data: { loyaltyPoints: { increment: number } } }) => {
        balances.set(where.id, (balances.get(where.id) ?? 0) + data.loyaltyPoints.increment);
        return {};
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => ({
        loyaltyPoints: balances.get(where.id) ?? 0,
      }),
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, entries, balances };
}

test("reprocessing the same partial refund does not reverse or restore twice", async () => {
  const db = fakeTx(50);
  await compensateOrderLoyalty(db.tx, "order");
  assert.equal(db.balances.get("buyer"), 5); // earned -5, redeem restore +10
  const count = db.entries.length;
  await compensateOrderLoyalty(db.tx, "order");
  assert.equal(db.entries.length, count);
  assert.equal(db.balances.get("buyer"), 5);
});

test("whole-order shipment return reverses earned/referral and restores redemption once", async () => {
  const db = fakeTx(0);
  await compensateOrderLoyalty(db.tx, "order", { returnedShipment: true });
  assert.equal(db.balances.get("buyer"), -40); // -10 earned +20 restore -50 referral
  assert.equal(db.balances.get("referrer"), -100); // referral debt if spent
  const count = db.entries.length;
  await compensateOrderLoyalty(db.tx, "order", { returnedShipment: true });
  assert.equal(db.entries.length, count);
});
