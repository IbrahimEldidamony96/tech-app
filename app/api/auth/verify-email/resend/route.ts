import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { issueVerificationToken } from "@/lib/verification-tokens";
import { sendEmail } from "@/lib/email";
import { verificationEmailHtml } from "@/lib/email-templates";
import { getAppOrigin } from "@/lib/app-url";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const { session, error } = await requireUser();
  if (error) return error;

  // بالـ IP مش بس باليوزر — عشان نفس الشخص ميقدرش يضغط "resend" آلاف
  // المرات حتى لو هو فعلًا صاحب الحساب
  const ip = getClientIp(request);
  const limit = await rateLimit(`verify-email-resend:${ip}`, 3, 10 * 60 * 1000);
  if (!limit.allowed) return rateLimitResponse(limit);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session!.user.id },
    select: { id: true, email: true, emailVerified: true },
  });

  if (user.emailVerified) {
    return NextResponse.json({ error: "Email is already verified" }, { status: 409 });
  }

  const token = await issueVerificationToken(user.id, "EMAIL_VERIFICATION");
  const link = `${getAppOrigin(request)}/api/auth/verify-email/confirm?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: "Verify your email — Tech Store",
    html: verificationEmailHtml(link),
  });

  return NextResponse.json({ data: { sent: true } });
}
