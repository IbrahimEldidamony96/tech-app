import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { reconcileEmailDelivery } from "@/lib/email-delivery";
import { z } from "zod";

export async function PATCH(request: Request) {
  const guard = await requirePermission("settings:manage");
  if (guard.error) return guard.error;
  const parsed = z.object({ key: z.string().min(1).max(255), evidence: z.string().trim().min(10).max(1000), confirmedDelivered: z.literal(true) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirm delivery in the provider dashboard and provide its message reference." }, { status: 400 });
  try {
    await reconcileEmailDelivery(parsed.data.key, guard.user.id, parsed.data.evidence);
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: "Delivery changed or could not be reconciled. Refresh and try again." }, { status: 409 }); }
}
