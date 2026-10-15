import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

// في وضع dev، Next.js بيعمل hot-reload لكل ملف بتعدله — لو عملنا
// `new PrismaClient()` مباشرة هنا، كل reload هيفتح connection pool جديدة
// للداتابيز من غير ما يقفل القديمة، ولحد ما يخلص Postgres الـ connections
// المسموحة (افتراضيًا 100) بعد شوية تعديلات بسيطة.
// الحل: نخزن الـ instance على globalThis ونعيد استخدامه بدل ما نعمل واحد جديد.

const globalForPrisma = globalThis as unknown as {
  pgPool?: Pool;
  prisma?: PrismaClient;
};

const pgPool =
  globalForPrisma.pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.VERCEL && !globalForPrisma.pgPool) {
  attachDatabasePool(pgPool);
}

const adapter = new PrismaPg(pgPool);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.pgPool = pgPool;
  globalForPrisma.prisma = prisma;
}
