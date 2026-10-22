import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { inquirePaymobTransaction, verifiedPaymobCapture, PaymobApiError } from "@/lib/paymob";
import { recordVerifiedCapture } from "@/lib/payment-capture";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("orders:write");
  if (guard.error) return guard.error;
  const { id } = await params;
  const parsed = z.object({ transactionId: z.string().regex(/^\d+$/).max(30) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide the Paymob transaction ID to verify" }, { status: 400 });
  try {
    const remote = await inquirePaymobTransaction(parsed.data.transactionId);
    const capture = verifiedPaymobCapture(remote, remote);
    if (capture.orderId !== id) throw new PaymobApiError("Transaction belongs to another order", 409);
    const data = await prisma.$transaction(async tx => {
      const order = await recordVerifiedCapture(tx, capture);
      await writeAuditLog(tx, { actorId: guard.user!.id, action: "STATUS_CHANGE", entityType: "Payment", entityId: id,
        summary: "Verified online payment with Paymob", metadata: { transactionId: capture.transactionId } });
      return { id: order.id, status: order.status, paymentStatus: order.paymentStatus };
    });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof PaymobApiError) return NextResponse.json({ error: error.message }, { status: error.status === 409 ? 409 : 503 });
    throw error;
  }
}
