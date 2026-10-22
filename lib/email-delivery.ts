import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { sendEmail, emailSender } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";

export async function reconcileEmailDelivery(key: string, actorId: string, evidence: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT key FROM "EmailDelivery" WHERE key = ${key} FOR UPDATE`;
    const delivery = await tx.emailDelivery.findUnique({ where: { key } });
    if (!delivery || delivery.status !== "NEEDS_REVIEW") throw new Error("Delivery no longer needs review");
    const now = new Date();
    await tx.emailDelivery.update({ where: { key }, data: { status: "SENT", sentAt: now, claimToken: null, leaseUntil: null, lastError: null } });
    if (key.startsWith("notification/")) await tx.notification.updateMany({ where: { id: key.slice(13), emailSentAt: null }, data: { emailSentAt: now } });
    if (key.startsWith("cart/")) {
      const [, id, revision] = key.split("/");
      if (id && revision && Number.isFinite(Date.parse(revision))) await tx.cart.updateMany({ where: { id, updatedAt: new Date(revision), abandonedReminderSentAt: null }, data: { abandonedReminderSentAt: now } });
    }
    await writeAuditLog(tx, { actorId, action: "UPDATE", entityType: "EmailDelivery", entityId: key, summary: "Operator confirmed email delivery from provider evidence", metadata: { evidence } });
  });
}
type Payload = { to: string; subject: string; html: string; from?: string };
export async function deliverEmail(key: string, payload: Payload, complete: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  if (!process.env.RESEND_API_KEY) return "suppressed" as const;
  await prisma.emailDelivery.createMany({ data: { key, payload: { ...payload, from: payload.from ?? emailSender() } }, skipDuplicates: true });
  const token = randomUUID();
  const claim = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT key FROM "EmailDelivery" WHERE key = ${key} FOR UPDATE`;
    const row = await tx.emailDelivery.findUniqueOrThrow({ where: { key } });
    if (row.status === "SENT") { await complete(tx); return { status: "sent" as const }; }
    if (row.status === "NEEDS_REVIEW") return { status: "review" as const };
    if (row.leaseUntil && row.leaseUntil > new Date()) return { status: "busy" as const };
    // Resend deduplicates for 24 hours. Never repeat an ambiguous delivery
    // after that window; surface it for reconciliation instead.
    if (row.firstAttemptAt && Date.now() - row.firstAttemptAt.getTime() >= 23 * 60 * 60 * 1000) {
      await tx.emailDelivery.update({ where: { key }, data: { status: "NEEDS_REVIEW", lastError: "Check provider delivery logs; the automatic idempotency window has closed" } });
      return { status: "review" as const };
    }
    await tx.emailDelivery.update({ where: { key }, data: { claimToken: token, leaseUntil: new Date(Date.now() + 120000), firstAttemptAt: row.firstAttemptAt ?? new Date(), attempts: { increment: 1 } } });
    return { status: "claimed" as const, payload: row.payload as unknown as Required<Payload> };
  });
  if (claim.status !== "claimed") return claim.status;
  try {
    const result = await sendEmail({ ...claim.payload, idempotencyKey: key });
    if (result.devMode) throw new Error("Email was suppressed; delivery remains pending");
    await prisma.$transaction(async tx => {
      const done = await tx.emailDelivery.updateMany({ where: { key, claimToken: token, status: "PENDING" }, data: { status: "SENT", sentAt: new Date(), claimToken: null, leaseUntil: null, lastError: null } });
      if (done.count) await complete(tx);
    });
    return "sent" as const;
  } catch (error) {
    await prisma.emailDelivery.updateMany({ where: { key, claimToken: token, status: "PENDING" }, data: { claimToken: null, leaseUntil: null, lastError: "Delivery attempt failed; retry with the same immutable payload and idempotency key" } }).catch(() => {});
    throw error;
  }
}
