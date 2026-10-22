import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inquirePaymobTransaction, PaymobApiError, verifiedPaymobCapture, verifyPaymobTransactionHmac } from "@/lib/paymob";
import { recordVerifiedCapture } from "@/lib/payment-capture";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("obj" in body) ||
      !body.obj || typeof body.obj !== "object" || Array.isArray(body.obj)) {
    return NextResponse.json({ error: "Missing transaction object" }, { status: 400 });
  }
  const obj = body.obj as Record<string, unknown>;
  try {
    if (!verifyPaymobTransactionHmac(obj, request.nextUrl.searchParams.get("hmac") ?? "")) {
      return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
    }
    if (obj.pending !== false || obj.success !== true || obj.is_refunded === true ||
        obj.is_voided === true || (obj.is_auth === true && obj.is_capture !== true)) {
      return NextResponse.json({ received: true });
    }
    const capture = verifiedPaymobCapture(obj, await inquirePaymobTransaction(String(obj.id)));
    await prisma.$transaction(tx => recordVerifiedCapture(tx, capture));
    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof PaymobApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status === 409 || error.status === 400 ? error.status : 503 });
    }
    console.error("Paymob callback processing failed", error);
    return NextResponse.json({ error: "Payment verification unavailable" }, { status: 503 });
  }
}
