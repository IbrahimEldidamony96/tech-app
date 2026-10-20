import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { consumeVerificationToken } from "@/lib/verification-tokens";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // بالـ IP — التوكن نفسه عشوائي 256-bit (مستحيل تخمينه)، لكن حد
  // الطلبات بيحمي من أي محاولة brute-force نظرية على أي حاجة تانية
  // في الـ endpoint ده
  const ip = getClientIp(request);
  const limit = await rateLimit(`reset-password:${ip}`, 10, 15 * 60 * 1000);
  if (!limit.allowed) return rateLimitResponse(limit);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Compute the hash first. Token consumption, password write, and
  // invalidation of every previously issued session commit together.
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await consumeVerificationToken(parsed.data.token, "PASSWORD_RESET", tx);
    if (!claimed) return false;

    const changed = await tx.user.updateMany({
      where: { id: claimed.userId, deletedAt: null },
      data: {
        password: passwordHash,
        sessionVersion: { increment: 1 },
      },
    });
    if (changed.count !== 1) return false;

    // Invalidate other outstanding password reset links for this user.
    await tx.verificationToken.updateMany({
      where: { userId: claimed.userId, type: "PASSWORD_RESET", usedAt: null },
      data: { usedAt: new Date() },
    });
    return true;
  });

  if (!updated) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { data: { reset: true, signInRequired: true } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
