import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { cents, maximumReturnRefund, paymentStatusAfterRefund } from "@/lib/refund-accounting";
import { inquirePaymobRefund } from "@/lib/paymob";
import { compensateOrderLoyalty } from "@/lib/order-loyalty-compensation";
import { createNotification } from "@/lib/notifications";
import { writeAuditLog } from "@/lib/audit";

export type RefundTarget = { kind: "return" | "order"; id: string };
type Actor = { id: string; role: string };
type Db = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);
const paid = (status: string) => status === "PAID" || status === "PARTIALLY_REFUNDED";
export class RefundError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

async function context(db: Db, target: RefundTarget) {
  const rr = target.kind === "return" ? await db.returnRequest.findUnique({
    where: { id: target.id },
    include: { items: { include: { orderItem: { select: { quantity: true, totalPrice: true } } } } },
  }) : null;
  if (target.kind === "return" && !rr) throw new RefundError("Return request not found", 404);
  const order = await db.order.findUnique({
    where: { id: rr?.orderId ?? target.id }, include: { payment: true },
  });
  if (!order?.payment) throw new RefundError("Order or payment not found", 404);
  return { rr, order, payment: order.payment };
}

const scope = (target: RefundTarget): Prisma.RefundWhereInput => target.kind === "return"
  ? { returnRequestId: target.id } : { orderId: target.id, returnRequestId: null };

function assertEligible(ctx: Awaited<ReturnType<typeof context>>, target: RefundTarget) {
  if (!paid(ctx.payment.status) || !paid(ctx.order.paymentStatus)) throw new RefundError("Payment was not captured");
  if (target.kind === "return" ? ctx.rr?.status !== "RECEIVED" : ctx.order.status !== "CANCELLED") {
    throw new RefundError(target.kind === "return" ? "Return must be received before a refund" : "Order refunds are available for cancelled orders and returned shipments");
  }
}

async function remoteRefunded(ctx: { payment: { method: string; transactionId: string | null; amount: Prisma.Decimal }; order: { id: string } }) {
  if (ctx.payment.method === "CASH_ON_DELIVERY") return null;
  if (!ctx.payment.transactionId) throw new RefundError("Missing verified payment transaction ID");
  return (await inquirePaymobRefund({
    orderId: ctx.order.id, transactionId: ctx.payment.transactionId, amountCents: cents(ctx.payment.amount),
  })).refundedAmountCents;
}

export async function createRefundIntent(target: RefundTarget, amount: string, actor: Actor) {
  const requested = new Prisma.Decimal(amount);
  if (requested.lte(0) || requested.decimalPlaces() > 2) throw new RefundError("Provide a positive amount with at most two decimal places", 400);
  const initial = await context(prisma, target);
  assertEligible(initial, target);
  const remote = await remoteRefunded(initial);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${initial.order.id} FOR UPDATE`;
    const current = await context(tx, target);
    assertEligible(current, target);
    if (current.payment.id !== initial.payment.id || current.payment.transactionId !== initial.payment.transactionId) throw new RefundError("Payment changed; reload and try again");
    if (await tx.refund.findFirst({ where: { ...scope(target), status: { not: "CANCELLED" } } })) {
      throw new RefundError("This return/order already has an active refund");
    }
    const rows = await tx.refund.findMany({ where: { orderId: current.order.id, status: { not: "CANCELLED" } }, select: { amount: true, status: true } });
    if (rows.some(row => row.status === "PENDING_CONFIRMATION")) throw new RefundError("Resolve the pending refund on this order first");
    const confirmed = rows.reduce((sum, row) => sum.add(row.amount), ZERO);
    const remaining = current.payment.amount.sub(confirmed);
    const limit = current.rr ? Prisma.Decimal.min(remaining, maximumReturnRefund(current.order, current.rr.items)) : remaining;
    if (requested.gt(limit)) throw new RefundError(`Refund exceeds available EGP ${limit.toFixed(2)}`);
    if (!current.rr && !requested.eq(remaining)) throw new RefundError(`Cancelled orders require the full remaining refund of EGP ${remaining.toFixed(2)}`);
    if (remote !== null && remote !== cents(confirmed)) throw new RefundError("Provider refunds disagree with the ledger; reconcile them before creating another request");
    const refund = await tx.refund.create({ data: {
      orderId: current.order.id, returnRequestId: current.rr?.id ?? null, paymentId: current.payment.id,
      amount: requested, providerBaselineCents: remote, requestedById: actor.id,
    } });
    await writeAuditLog(tx, { actorId: actor.id, action: "CREATE", entityType: "Refund", entityId: refund.id,
      summary: `Refund requested: EGP ${requested.toFixed(2)} for ${target.kind} ${target.id}; settlement pending` });
    return refund;
  }, { timeout: 15000 });
}

async function activeRefund(target: RefundTarget) {
  const refund = await prisma.refund.findFirst({ where: { ...scope(target), status: { not: "CANCELLED" } }, include: { payment: true } });
  if (!refund) throw new RefundError("Active refund request not found", 404);
  return refund;
}

function requireAdministrator(actor: Actor) {
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") throw new RefundError("An administrator must reconcile refund settlements", 403);
}

export async function confirmRefundIntent(target: RefundTarget, evidenceReference: string | undefined, actor: Actor) {
  requireAdministrator(actor);
  const initial = await activeRefund(target);
  if (initial.status === "CONFIRMED") return initial;
  const ctx = await context(prisma, target);
  const remote = await remoteRefunded(ctx);
  let externalReference: string;
  if (remote === null) {
    if (!evidenceReference || evidenceReference.trim().length < 8) throw new RefundError("Enter the manual settlement receipt/reference", 400);
    externalReference = `MANUAL:${evidenceReference.trim()}`;
  } else {
    if (initial.providerBaselineCents === null || remote !== initial.providerBaselineCents + cents(initial.amount)) {
      throw new RefundError("The provider has not confirmed exactly this refund amount");
    }
    externalReference = `PAYMOB:${ctx.payment.transactionId}:${remote}`;
  }
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${initial.orderId} FOR UPDATE`;
    const refund = await tx.refund.findUnique({ where: { id: initial.id } });
    if (!refund || refund.status === "CANCELLED") throw new RefundError("Refund request was cancelled");
    if (refund.status === "CONFIRMED") return refund;
    const current = await context(tx, target);
    assertEligible(current, target);
    if (refund.paymentId !== current.payment.id || current.payment.transactionId !== ctx.payment.transactionId || refund.providerBaselineCents !== initial.providerBaselineCents) {
      throw new RefundError("Payment changed while the settlement was being checked");
    }
    const previous = await tx.refund.aggregate({ where: { orderId: refund.orderId, status: "CONFIRMED" }, _sum: { amount: true } });
    const prior = previous._sum.amount ?? ZERO;
    const sum = prior.add(refund.amount);
    if (sum.gt(current.payment.amount) || (remote !== null && (remote !== cents(sum) || refund.providerBaselineCents !== cents(prior)))) {
      throw new RefundError("Refund amount disagrees with the payment ledger");
    }
    const updated = await tx.refund.update({ where: { id: refund.id }, data: {
      status: "CONFIRMED", providerReference: externalReference, confirmedAt: new Date(), confirmedById: actor.id,
      confirmationNote: remote === null ? "Reconciled against manual settlement receipt" : "Verified by provider transaction inquiry",
    } });
    if (refund.returnRequestId) await tx.returnRequest.update({ where: { id: refund.returnRequestId }, data: { status: "REFUNDED", refundAmount: refund.amount } });
    const paymentStatus = paymentStatusAfterRefund(current.payment.amount, sum);
    await tx.payment.update({ where: { id: current.payment.id }, data: { status: paymentStatus } });
    await tx.order.update({ where: { id: current.order.id }, data: { paymentStatus } });
    await compensateOrderLoyalty(tx, current.order.id);
    await writeAuditLog(tx, { actorId: actor.id, action: "STATUS_CHANGE", entityType: "Refund", entityId: refund.id,
      summary: `Reconciled EGP ${refund.amount.toFixed(2)} refund`, metadata: { externalReference, paymentStatus } });
    await createNotification(tx, { userId: current.order.userId, type: "PAYMENT", title: "Refund confirmed",
      message: `EGP ${refund.amount.toFixed(2)} was refunded for order ${current.order.id}.`, link: `/orders/${current.order.id}` });
    return updated;
  }, { timeout: 15000 });
}

export async function cancelRefundIntent(target: RefundTarget, reason: string, actor: Actor) {
  requireAdministrator(actor);
  const initial = await activeRefund(target);
  if (initial.status !== "PENDING_CONFIRMATION") throw new RefundError("A settled refund cannot be cancelled");
  const ctx = await context(prisma, target);
  const remote = await remoteRefunded(ctx);
  if (remote !== null && remote !== initial.providerBaselineCents) throw new RefundError("The provider refund balance changed; reconcile the settlement before cancelling");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${initial.orderId} FOR UPDATE`;
    const refund = await tx.refund.findUnique({ where: { id: initial.id }, include: { payment: true } });
    if (!refund || refund.status !== "PENDING_CONFIRMATION" || refund.payment.transactionId !== ctx.payment.transactionId || refund.providerBaselineCents !== initial.providerBaselineCents) {
      throw new RefundError("Refund status changed; reload before trying again");
    }
    const confirmed = await tx.refund.aggregate({ where: { orderId: refund.orderId, status: "CONFIRMED" }, _sum: { amount: true } });
    if (remote !== null && cents(confirmed._sum.amount ?? ZERO) !== remote) throw new RefundError("Provider balance disagrees with the ledger");
    const updated = await tx.refund.update({ where: { id: refund.id }, data: { status: "CANCELLED", cancellationReason: reason } });
    await writeAuditLog(tx, { actorId: actor.id, action: "STATUS_CHANGE", entityType: "Refund", entityId: refund.id,
      summary: "Cancelled unexecuted refund request", metadata: { reason, amount: refund.amount.toFixed(2), operatorAttestedNoTransfer: true } });
    return updated;
  }, { timeout: 15000 });
}
