import "dotenv/config";
import { defineConfig } from "prisma/config";

// *** باج كان موجود: env("DATABASE_URL") بترمي error فورًا لو المتغيّر
// مش موجود — وده كان بيكسر أول `npm install` على أي clone جديد، لأن
// postinstall بيشغّل `prisma generate` قبل ما تعمل .env أصلاً بالترتيب
// اللي الـ README نفسه بيوصفه (cp .env.example .env بييجي بعد npm install).
//
// prisma generate مش بيفتح اتصال حقيقي بالداتابيز خالص — بس محتاج
// string شكله صحيح. فلو DATABASE_URL مش موجودة، بنستخدم placeholder
// آمن بدل ما نوقف كل حاجة. أي أمر فعلاً محتاج يتصل بداتابيز حقيقية
// (migrate dev، migrate deploy، db seed، الـ dev server نفسه) هيفشل
// بخطأ اتصال واضح ("connection refused" على placeholder) لو لسه معملتش
// .env — مش هيتظاهر إنه نجح.
const DATABASE_URL =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.DATABASE_URL ??
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: DATABASE_URL,
  },
});
