import { NextRequest, NextResponse } from "next/server";
import { getBostaCities, BostaApiError } from "@/lib/bosta";
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit";

// Endpoint عام (من غير أدمن) — العميل نفسه بيحتاجه وقت الـ checkout عشان
// يختار محافظته من نفس القايمة اللي عند Bosta بالظبط، فمفيش تضارب
// أسماء بعدين وقت إنشاء الشحنة. بيرجّع بس id/name، مش الـ object الخام
// كامل (فيه تفاصيل داخلية زي الـ hub مش لازمة للفرونت إند).
//
// *** باج كان موجود: مفيش أي حد — endpoint عام بيستخدم مفتاح Bosta
// بتاعنا، بوت يقدر يستنزفه بسهولة. 30 كل دقيقة سخي جدًا لأي استخدام
// حقيقي (الصفحة بتنادي كل endpoint مرة واحدة أو اتنين وقت اختيار العنوان).
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`bosta-proxy:${ip}`, 30, 60 * 1000);
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const cities = await getBostaCities();
    return NextResponse.json({
      data: cities.map((c) => ({ id: c._id, name: c.name })),
    });
  } catch (err) {
    const message =
      err instanceof BostaApiError || err instanceof Error
        ? err.message
        : "Bosta request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
