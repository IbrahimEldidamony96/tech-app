import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/require-permission";
import { PaymobApiError } from "@/lib/paymob";
import { cancelRefundIntent, confirmRefundIntent, createRefundIntent, RefundError, type RefundTarget } from "@/lib/refund-service";

const create = z.object({ amount: z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/) });
const confirm = z.object({ evidenceReference: z.string().trim().min(8).max(120).optional() });
const cancel = z.object({ reason: z.string().trim().min(8).max(500), noTransferMade: z.literal(true) });

export async function refundRoute(request: Request, target: RefundTarget, method: "POST" | "PATCH" | "DELETE") {
  const guard = await requirePermission("returns:write");
  if (guard.error) return guard.error;
  const body: unknown = await request.json().catch(() => null);
  try {
    if (method === "POST") {
      const input = create.safeParse(body);
      if (!input.success) throw new RefundError("Provide a positive refund amount with up to two decimal places", 400);
      return NextResponse.json({ data: await createRefundIntent(target, input.data.amount, guard.user!), instruction: "Settle the refund externally, then confirm it here." }, { status: 201 });
    }
    if (method === "DELETE") {
      const input = cancel.safeParse(body);
      if (!input.success) throw new RefundError("Provide a reason and confirm no transfer was made", 400);
      return NextResponse.json({ data: await cancelRefundIntent(target, input.data.reason, guard.user!) });
    }
    const input = confirm.safeParse(body);
    if (!input.success) throw new RefundError("Invalid settlement reference", 400);
    return NextResponse.json({ data: await confirmRefundIntent(target, input.data.evidenceReference, guard.user!) });
  } catch (error) {
    if (error instanceof RefundError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof PaymobApiError) return NextResponse.json({ error: error.message }, { status: 503 });
    throw error;
  }
}
