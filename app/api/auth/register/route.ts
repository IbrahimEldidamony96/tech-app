import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations/auth";
import { Prisma } from "@/app/generated/prisma/client";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";
import { issueVerificationToken } from "@/lib/verification-tokens";
import { sendEmail } from "@/lib/email";
import { verificationEmailHtml } from "@/lib/email-templates";
import { getAppOrigin } from "@/lib/app-url";
import { randomBytes } from "crypto";

// NextAuth بيدير تسجيل الدخول (authorize) بس، مش إنشاء يوزر جديد —
// ده endpoint منفصل بالكامل بنعمله إحنا.
export async function POST(request: NextRequest) {
  // *** باج كان موجود: مفيش أي حد لعدد محاولات التسجيل — بوت يقدر ينشئ
  // آلاف الحسابات الوهمية في دقايق. 5 كل ساعة لكل IP كفاية لأي حد حقيقي
  // (حتى لو غلط في الإيميل مرتين-تلاتة) من غير ما يعطّل استخدام عادي.
  const ip = getClientIp(request);
  const limit = await rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) return rateLimitResponse(limit);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, email, password, referralCode } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const referrer = referralCode
      ? await prisma.user.findFirst({
          where: { referralCode, deletedAt: null },
          select: { id: true },
        })
      : null;

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: passwordHash,
        role: "CUSTOMER",
        referralCode: randomBytes(5).toString("hex").toUpperCase(),
        referredById: referrer?.id ?? null,
      },
      select: { id: true, name: true, email: true, referralCode: true },
    });

    // تسجيل الدخول مش موقوف على تأكيد الإيميل (soft verification) —
    // فمفيش داعي نوقف رد التسجيل لو إرسال الإيميل اتأخر أو فشل. أي
    // فشل هنا بيتسجل بس، مش بيرجع error للعميل (الحساب اتعمل فعلًا بنجاح).
    try {
      const token = await issueVerificationToken(user.id, "EMAIL_VERIFICATION");
      const link = `${getAppOrigin(request)}/api/auth/verify-email/confirm?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: "Verify your email — Tech Store",
        html: verificationEmailHtml(link),
      });
    } catch (err) {
      console.error("Failed to send verification email", err);
    }

    return NextResponse.json({ data: user }, { status: 201 });
  } catch (err) {
    // P2002 = الإيميل ده مسجل قبل كده
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }
    throw err;
  }
}
