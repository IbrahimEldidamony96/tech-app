import { prisma } from "@/lib/prisma";

// *** ترقية: كان هنا حل في الذاكرة بس (حماية جزئية — كل instance
// عندها عدّاد منفصل، بيتصفّر مع أي cold start). دلوقتي العدّاد نفسه في
// Postgres، فبيشتغل صح بغض النظر عن عدد الـ instances اللي Vercel
// بتشغّلها، وبيفضل موجود عبر deployments مختلفة.
//
// statement واحد ذرّي (INSERT ... ON CONFLICT ... DO UPDATE) بيعمل
// الاتنين مع بعض: لو مفيش صف للـ key ده، يعمل واحد جديد بعداد 1؛ لو
// موجود ولسه جوه نفس النافذة الزمنية، يزوّد العداد؛ لو النافذة
// انتهت، يبدأ نافذة جديدة من 1. كله في statement واحد عشان مفيش سباق
// ممكن يحصل بين "اقرا العداد" و"زوّده" — نفس فلسفة compare-and-set
// المستخدمة في المخزون والكوبونات، بس هنا الداتابيز نفسها بتعمل
// الحساب في السطر الواحد بدل ما نعمله إحنا في كود.
export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

// تنظيف الصفوف القديمة (expired من فترة) — نسبة بسيطة لكل نداء بدل
// ما نشغّل job منفصل بس لده. الصفوف اللي لسه جوه نافذتها متضمنتش.
async function occasionallyCleanup() {
  if (Math.random() > 0.01) return; // ~1% من النداءات
  const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.rateLimitBucket
    .deleteMany({ where: { resetAt: { lt: staleCutoff } } })
    .catch(() => {}); // تنظيف اختياري — فشله مايوقفش أي حاجة
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const newResetAt = new Date(now.getTime() + windowMs);

  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, ${newResetAt}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${newResetAt}
        ELSE "RateLimitBucket"."resetAt"
      END,
      "updatedAt" = ${now}
    RETURNING "count", "resetAt"
  `;

  void occasionallyCleanup();

  const row = rows[0];
  return {
    allowed: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    resetAt: row.resetAt.getTime(),
  };
}

/**
 * عنوان IP الحقيقي بتاع العميل — Vercel (وأي proxy قدامها) بيحطه في
 * x-forwarded-for. أول قيمة في اللستة هي عنوان العميل الأصلي (الباقي
 * عناوين أي proxies اتعدّى عليها الطلب). لو الهيدر مش موجود (تطوير
 * محلي من غير proxy قدامه مثلاً)، بنرجع قيمة ثابتة عشان الكود مايرميش
 * error، على حساب إن كل الطلبات المحلية بتتحسب كأنها من نفس المصدر.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function formatRetryAfter(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

/** Route handlers (NextResponse): رسالة 429 جاهزة بهيدر Retry-After */
export function rateLimitResponse(result: RateLimitResult) {
  return Response.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(formatRetryAfter(result.resetAt)) },
    },
  );
}
