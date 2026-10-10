import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeVerificationToken } from "@/lib/verification-tokens";
import { getAppOrigin } from "@/lib/app-url";

// بيتفتح من رابط جوه الإيميل (GET عادي في المتصفح، مش fetch من JS) —
// فلازم يرجع redirect لصفحة حقيقية، مش JSON
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const origin = getAppOrigin(request);

  if (!token) {
    return NextResponse.redirect(`${origin}/verify-email?status=invalid`);
  }

  const result = await consumeVerificationToken(token, "EMAIL_VERIFICATION");
  if (!result) {
    return NextResponse.redirect(`${origin}/verify-email?status=invalid`);
  }

  await prisma.user.update({
    where: { id: result.userId },
    data: { emailVerified: new Date() },
  });

  return NextResponse.redirect(`${origin}/verify-email?status=success`);
}
