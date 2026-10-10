import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// في وضع dev، Next.js بيعمل hot-reload لكل ملف بتعدله — لو عملنا
// `new PrismaClient()` مباشرة هنا، كل reload هيفتح connection pool جديدة
// للداتابيز من غير ما يقفل القديمة، ولحد ما يخلص Postgres الـ connections
// المسموحة (افتراضيًا 100) بعد شوية تعديلات بسيطة.
// الحل: نخزن الـ instance على globalThis ونعيد استخدامه بدل ما نعمل واحد جديد.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
