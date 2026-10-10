import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { issueVerificationToken } from "@/lib/verification-tokens";
import { sendEmail } from "@/lib/email";
import { passwordResetEmailHtml } from "@/lib/email-templates";
import { getAppOrigin } from "@/lib/app-url";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";

// *** باج كان موجود: كانت دي قيمة واحدة ثابتة (NextResponse.json(...))
// بترجع من مكانين مختلفين في نفس الملف. Response body قابل للقراءة
// مرة واحدة بس (stream) — فأي حد (أو أي كود، زي اختبار) يحاول يقرا
// الـ body من طلبين استخدموا نفس الـ instance، التاني هيفشل بـ "Body
// is unusable: Body has already been read". الحل: دالة بترجع response
// جديدة كل مرة تتنادى، مش نفس الكائن.
function genericResponse() {
  return NextResponse.json({
    data: { message: "If that email has an account, we've sent a password reset link." },
  });
}

export async function POST(request: NextRequest) {
  // بالـ IP — بريد استعادة الباسورد سلاح كلاسيكي للإزعاج (email bombing)
  // لو مفيش حد عليه. 3 كل 15 دقيقة كفاية لأي استخدام حقيقي.
  const ip = getClientIp(request);
  const limit = await rateLimit(`forgot-password:${ip}`, 3, 15 * 60 * 1000);
  if (!limit.allowed) return rateLimitResponse(limit);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, password: true, deletedAt: true },
  });

  // *** مهم: نفس الرد بالظبط سواء الإيميل موجود أو لأ، وسواء الحساب
  // داخل بجوجل بس (مالوش password) أو لأ — غير كده حد يقدر يستخدم
  // الفورم ده كأداة يتأكد بيها إنت عندك حساب على الموقع من عدمه
  // (email enumeration)، حتى لو مبيشوفش أي باسورد فعلي
  if (!user || !user.password || user.deletedAt) {
    return genericResponse();
  }

  const token = await issueVerificationToken(user.id, "PASSWORD_RESET");
  const link = `${getAppOrigin(request)}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your password — Tech Store",
    html: passwordResetEmailHtml(link),
  });

  return genericResponse();
}
