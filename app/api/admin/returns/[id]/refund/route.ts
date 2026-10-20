import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { maximumReturnRefund, cents, paymentStatusAfterRefund, refundBalance } from "@/lib/refund-accounting";
import { inquirePaymobRefund, PaymobApiError } from "@/lib/paymob";
import { compensateOrderLoyalty } from "@/lib/order-loyalty-compensation";
import { writeAuditLog } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";

type Context = { params: Promise<{ id: string }> };
const createSchema = z.object({ amount: z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/) });
const confirmSchema = z.object({ evidenceReference: z.string().trim().min(8).max(120).optional() });
const ZERO = new Prisma.Decimal(0);
const isPaid = (status: string) => status === "PAID" || status === "PARTIALLY_REFUNDED";
const failure = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/**
 * Create a PENDING_CONFIRMATION ledger entry, NOT a money movement.
 * An operator must independently initiate the refund with Paymob / bank.
 * All intents and confirmations of the same order serialize via Order FOR UPDATE.
 */
export async function POST(request: Request, { params }: Context) {
  const guard = await requirePermission("returns:write");
  if (guard.error) return guard.error;
  const { id } = await params;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("Provide a positive EGP refund amount, at most two decimal places", 400);
  const requested = new Prisma.Decimal(parsed.data.amount);
  if (requested.lte(ZERO)) return failure("Refund must be greater than zero", 400);

  // Provider network calls must be OUTSIDE SQL transactions. Strict
  // reconciliation is unavailable unless PAYMOB_API_KEY is configured.
  const initial = await prisma.returnRequest.findUnique({
    where: { id },
    include: { order: { include: { payment: true } } },
  });
  if (!initial) return failure("Return request not found", 404);
  const payment = initial.order.payment;
  if (!payment || !isPaid(payment.status)) return failure("Payment was not captured", 409);
  let remoteCents: number | null = null;
  if (payment.method !== "CASH_ON_DELIVERY") {
    if (!payment.transactionId) return failure("Missing verified Paymob transaction ID", 409);
    try {
      const inquiry = await inquirePaymobRefund({
        orderId: initial.orderId,
        transactionId: payment.transactionId,
        amountCents: cents(payment.amount),
      });
      remoteCents = inquiry.refundedAmountCents;
    } catch (e) {
      const err = e instanceof PaymobApiError ? e.message : "Could not verify Paymob refund state";
      return failure(err, 502);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${initial.orderId} FOR UPDATE`;
    const rr = await tx.returnRequest.findUnique({
      where: { id },
      include: {
        items: { include: { orderItem: { select: { quantity: true, totalPrice: true } } } },
        order: { include: { payment: true } },
        refund: true,
      },
    });
    if (!rr || rr.orderId !== initial.orderId) return { kind: "missing" as const };
    if (rr.status !== "RECEIVED" || rr.refund) return { kind: "invalid" as const };
    const pay = rr.order.payment;
    if (!pay || !isPaid(pay.status) || !isPaid(rr.order.paymentStatus) ||
        pay.id !== payment.id || pay.transactionId !== payment.transactionId) {
      return { kind: "invalid" as const };
    }

    const maxReturn = maximumReturnRefund(rr.order, rr.items);
    if (requested.gt(maxReturn)) {
      return { kind: "too_large" as const, limit: maxReturn.toFixed(2) };
    }
    // Permit only one pending refund per order. Together with the locked
    // parent Order, this makes provider cumulative checks unambiguous.
    const refunds = await tx.refund.findMany({
      where: { orderId: rr.orderId },
      select: { amount: true, status: true },
    });
    const confirmed = refunds.filter((x) => x.status === "CONFIRMED")
      .reduce((sum, x) => sum.add(x.amount), ZERO);
    const pending = refunds.filter((x) => x.status === "PENDING_CONFIRMATION")
      .reduce((sum, x) => sum.add(x.amount), ZERO);
    if (pending.gt(ZERO)) return { kind: "pending" as const };
    if (requested.gt(refundBalance(pay.amount, confirmed, pending))) {
      return { kind: "too_large" as const, limit: refundBalance(pay.amount, confirmed, pending).toFixed(2) };
    }
    if (pay.method !== "CASH_ON_DELIVERY" && remoteCents !== cents(confirmed)) {
      return { kind: "unreconciled" as const };
    }

    const refund = await tx.refund.create({
      data: {
        orderId: rr.orderId,
        returnRequestId: id,
        paymentId: pay.id,
        amount: requested,
        providerBaselineCents: remoteCents,
        requestedById: guard.user!.id,
      },
    });
    await writeAuditLog(tx, {
      actorId: guard.user!.id,
      action: "CREATE",
      entityType: "Refund",
      entityId: refund.id,
      summary: `Refund requested: EGP ${requested.toFixed(2)} for return ${id}; external execution pending`,
    });
    return { kind: "ok" as const, refund };
  }, { timeout: 10000 });

  if (result.kind === "missing") return failure("Return request not found", 404);
  if (result.kind === "invalid") return failure("Return must be RECEIVED and not already refunded", 409);
  if (result.kind === "pending") return failure("Reconcile the pending refund on this order first", 409);
  if (result.kind === "too_large") return failure(`Refund exceeds available EGP ${result.limit}`, 409);
  if (result.kind === "unreconciled") return failure("Paymob already has unmatched refunds; investigate before creating another", 409);
  return NextResponse.json({ data: result.refund, instruction: "Refund is not sent. Execute it externally, then confirm reconciliation." }, { status: 201 });
}

/**
 * Confirm only after verifying REAL money movement. For Paymob, the remote
 * cumulative refunded cents MUST increase by exactly this refund's amount
 * from the provider snapshot captured at creation. COD requires explicit
 * manual evidence. No guessed callback IDs or unverified payment statuses.
 */
export async function PATCH(request: Request, { params }: Context) {
  const guard = await requirePermission("returns:write");
  if (guard.error) return guard.error;
  // Cash refund attestation is a financial action. A returns manager may
  // prepare a refund, but only current database-backed ADMIN/SUPER_ADMIN
  // authority may confirm that money was returned.
  if (guard.user!.role !== "ADMIN" && guard.user!.role !== "SUPER_ADMIN") {
    return failure("Only an administrator can confirm refund settlement", 403);
  }
  const { id } = await params;
  const parsed = confirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("Invalid refund confirmation", 400);

  const preliminary = await prisma.refund.findUnique({
    where: { returnRequestId: id },
    include: { payment: true },
  });
  if (!preliminary) return failure("Refund intent not found", 404);
  if (preliminary.status === "CONFIRMED") return NextResponse.json({ data: preliminary, alreadyConfirmed: true });

  let verifiedCents: number | null = null;
  let externalRef: string;
  if (preliminary.payment.method === "CASH_ON_DELIVERY") {
    if (!parsed.data.evidenceReference) return failure("Manual refund needs a settlement receipt/reference", 400);
    externalRef = `MANUAL:${parsed.data.evidenceReference}`;
  } else {
    if (!preliminary.payment.transactionId || preliminary.providerBaselineCents === null) {
      return failure("Paymob refund cannot be reconciled without its verified transaction", 409);
    }
    try {
      const inquiry = await inquirePaymobRefund({
        transactionId: preliminary.payment.transactionId,
        orderId: preliminary.orderId,
        amountCents: cents(preliminary.payment.amount),
      });
      verifiedCents = inquiry.refundedAmountCents;
    } catch (e) {
      return failure(e instanceof PaymobApiError ? e.message : "Paymob inquiry failed", 502);
    }
    const expected = preliminary.providerBaselineCents + cents(preliminary.amount);
    if (verifiedCents !== expected) return failure(
      "Paymob has not confirmed exactly this refund amount; review provider state before retrying", 409,
    );
    externalRef = `PAYMOB:${preliminary.payment.transactionId}:${verifiedCents}`;
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${preliminary.orderId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ReturnRequest" WHERE id = ${id} FOR UPDATE`;
    const refund = await tx.refund.findUnique({
      where: { returnRequestId: id },
      include: { payment: true, returnRequest: true },
    });
    if (!refund || refund.orderId !== preliminary.orderId || refund.id !== preliminary.id) {
      return { kind: "invalid" as const };
    }
    if (refund.status === "CONFIRMED") return { kind: "already" as const, refund };
    if (refund.returnRequest.status !== "RECEIVED" || !isPaid(refund.payment.status)) {
      return { kind: "invalid" as const };
    }
    if (refund.payment.method !== "CASH_ON_DELIVERY" &&
        (refund.providerBaselineCents !== preliminary.providerBaselineCents ||
         refund.payment.transactionId !== preliminary.payment.transactionId)) {
      return { kind: "invalid" as const };
    }

    const previous = await tx.refund.aggregate({
      where: { orderId: refund.orderId, status: "CONFIRMED" },
      _sum: { amount: true },
    });
    const sum = (previous._sum.amount ?? ZERO).add(refund.amount);
    if (sum.gt(refund.payment.amount) ||
        (refund.payment.method !== "CASH_ON_DELIVERY" &&
         (verifiedCents !== cents(sum) || refund.providerBaselineCents !== cents(previous._sum.amount ?? ZERO)))) {
      return { kind: "unreconciled" as const };
    }

    const updated = await tx.refund.update({
      where: { id: refund.id },
      data: {
        status: "CONFIRMED",
        providerReference: externalRef,
        confirmationNote: refund.payment.method === "CASH_ON_DELIVERY"
          ? "Manually reconciled against payment receipt"
          : "Verified with Paymob transaction inquiry",
        confirmedAt: new Date(),
        confirmedById: guard.user!.id,
      },
    });
    await tx.returnRequest.update({
      where: { id },
      data: { status: "REFUNDED", refundAmount: refund.amount },
    });
    const paymentStatus = paymentStatusAfterRefund(refund.payment.amount, sum);
    await tx.payment.update({ where: { id: refund.paymentId }, data: { status: paymentStatus } });
    await tx.order.update({ where: { id: refund.orderId }, data: { paymentStatus } });
    await compensateOrderLoyalty(tx, refund.orderId);

    await writeAuditLog(tx, {
      actorId: guard.user!.id,
      action: "STATUS_CHANGE",
      entityType: "Refund",
      entityId: refund.id,
      summary: `Reconciled ${refund.amount.toFixed(2)} EGP refund for order ${refund.orderId}`,
      metadata: { providerReference: externalRef, paymentStatus },
    });
    await createNotification(tx, {
      userId: refund.returnRequest.userId,
      type: "PAYMENT",
      title: "Refund confirmed",
      message: `EGP ${refund.amount.toFixed(2)} was confirmed as refunded.`,
      link: "/account/returns",
    });
    return { kind: "ok" as const, updated };
  }, { timeout: 10000 });

  if (result.kind === "invalid") return failure("Refund or payment status changed; reload and retry", 409);
  if (result.kind === "unreconciled") return failure("Refund amount disagrees with the confirmed payment ledger", 409);
  if (result.kind === "already") return NextResponse.json({ data: result.refund, alreadyConfirmed: true });
  return NextResponse.json({ data: result.updated });
}
