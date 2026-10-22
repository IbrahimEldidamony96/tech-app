import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma, VerificationTokenType } from "@/app/generated/prisma/client";

const EXPIRY_HOURS: Record<VerificationTokenType, number> = {
  EMAIL_VERIFICATION: 24,
  PASSWORD_RESET: 1, // أقصر عمدًا — لينك استعادة الباسورد أخطر لو اتسرّب
};

// 32 بايت عشوائي = 256 bit من الإنتروبي — مستحيل عمليًا تخمينه
export async function issueVerificationToken(
  userId: string,
  type: VerificationTokenType,
): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS[type] * 60 * 60 * 1000);

  // Invalidate older outstanding tokens of the same purpose and persist only
  // a one-way hash. A database leak can no longer reveal usable reset links.
  await prisma.$transaction(async (tx) => {
    // Password changes, reset consumption and issuance always lock User first.
    // An issuance already in progress cannot escape password-change revocation.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    await tx.verificationToken.deleteMany({ where: { userId, type, usedAt: null } });
    await tx.verificationToken.create({
      data: { userId, token: tokenHash, type, expiresAt },
    });
  });

  return token;
}

// compare-and-set: تحديث usedAt بشرط إنه لسه null والتوكن مش منتهي —
// نفس مبدأ المخزون/الكوبونات، بيمنع استخدام نفس التوكن مرتين حتى لو
// اتبعت طلبين بنفس التوكن في نفس اللحظة بالظبط
export async function consumeVerificationToken(
  token: string,
  type: VerificationTokenType,
  db?: Pick<Prisma.TransactionClient, "verificationToken" | "$queryRaw">,
): Promise<{ userId: string } | null> {
  if (!db) {
    return prisma.$transaction((tx) => consumeVerificationToken(token, type, tx));
  }
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const record = await db.verificationToken.findUnique({
    where: { token: tokenHash },
    select: { userId: true },
  });
  if (!record) return null;
  if (type === "PASSWORD_RESET") {
    await db.$queryRaw`SELECT id FROM "User" WHERE id = ${record.userId} FOR UPDATE`;
  }
  const result = await db.verificationToken.updateMany({
    where: { token: tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  if (result.count === 0) return null;

  return record;
}
