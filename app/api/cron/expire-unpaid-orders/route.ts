import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cancelOrderAndRestock } from "@/lib/order-cancellation";
import { expiryMinutesFromEnv } from "@/lib/order-expiry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const BATCH_SIZE = 25;

/**
 * Vercel Hobby allows only daily cron schedules. A separate opt-in GitHub
 * Actions scheduled workflow can trigger this same authenticated endpoint
 * every 15 minutes; the Vercel daily schedule remains a fallback.
 *
 * External success is NOT guaranteed just because this handler exists:
 * configure the scheduler secret and verify its actual workflow runs.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let expiryMinutes: number;
  try {
    expiryMinutes = expiryMinutesFromEnv(process.env.UNPAID_ORDER_EXPIRY_MINUTES);
  } catch (error) {
    console.error("Invalid unpaid-order expiry configuration", error);
    return NextResponse.json({ error: "Expiry job configuration is invalid" }, { status: 503 });
  }
  const cutoff = new Date(Date.now() - expiryMinutes * 60 * 1000);

  // Query only IDs here. The cancellation service re-reads order + payment
  // UNDER Order FOR UPDATE, avoiding stale and untrusted scan snapshots.
  const candidates = await prisma.order.findMany({
    where: {
      status: "PENDING",
      paymentStatus: "PENDING",
      createdAt: { lt: cutoff },
      payment: { is: { method: { not: "CASH_ON_DELIVERY" }, status: "PENDING" } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
    take: BATCH_SIZE,
  });

  let cancelled = 0;
  let skipped = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const done = await cancelOrderAndRestock(
        candidate,
        ["PENDING"],
        { unpaidExpiredBefore: cutoff },
      );
      if (done) cancelled++;
      else skipped++;
    } catch (error) {
      failed++;
      console.error(`Expiry cancellation for order ${candidate.id} failed`, error);
    }
  }

  return NextResponse.json(
    { checked: candidates.length, cancelled, skipped, failed,
      backlogMayRemain: candidates.length === BATCH_SIZE,
      cutoff: cutoff.toISOString(), expiryMinutes },
    { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
