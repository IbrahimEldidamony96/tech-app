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

  const result = await consumeVerificationToken(parsed.data.token, "PASSWORD_RESET");
  if (!result) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: result.userId },
    data: { password: passwordHash },
  });

  return NextResponse.json({ data: { reset: true } });
}
