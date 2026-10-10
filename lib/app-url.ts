import type { NextRequest } from "next/server";

// *** باج كان موجود: روابط الـ callback بتاعة Paymob (notificationUrl،
// redirectionUrl) كانت بتتبني من request.nextUrl.origin — ده مبني على
// هيدر Host اللي المتصفح/العميل بيبعته. على Vercel مفيش مشكلة (Vercel
// نفسها بتضبط الهيدر ده صح قبل ما يوصل للتطبيق)، لكن لو استضفت المشروع
// بنفسك ورا reverse proxy مش مظبوط صح، حد يقدر يزوّر هيدر Host ويخلي
// Paymob تبعت الـ webhook لدومين تاني بالكامل.
//
// الحل: لو APP_URL متظبطة في البيئة، بنستخدمها دايمًا (قيمة ثابتة مش
// متأثرة بأي هيدر جاي من العميل). لو مش متظبطة، بنرجع لنفس السلوك
// القديم (origin من الـ request) عشان يفضل شغال من غير أي إعداد إضافي
// على Vercel.
export function getAppOrigin(request: NextRequest | Request): string {
  const configured = process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}
