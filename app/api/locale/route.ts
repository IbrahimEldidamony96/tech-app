import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, SUPPORTED_LOCALES } from "@/i18n/request";
import { safeNextPath } from "@/lib/safe-next-path";

// زرار تبديل اللغة بيعمل navigation عادي لـ /api/locale?locale=ar&redirect=/products/x
// بدل ما يبقى client component معقد بيعمل fetch + router.refresh(). ده أبسط
// وأضمن: full page load حقيقي، فـ <html lang>/dir والـ Tailwind rtl: variants
// بترجع صح من أول مرة من غير أي مشاكل hydration أو re-render جزئي.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const requested = searchParams.get("locale");
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(requested ?? "")
    ? (requested as string)
    : "en";

  // *** باج كان موجود: startsWith("/") بيقبل "//evil.example" و
  // "/\evil.example" كمان — المتصفح ("new URL" هنا كمان) بيتعامل مع
  // الاتنين كـ protocol-relative URL لموقع تاني خالص، مش مسار داخل
  // موقعنا. النتيجة: رابط بريد إلكتروني أو زرار شكله /api/locale?...
  // كان يقدر يودّي حد لموقع تصيّد خارجي وهو حاسس إنه لسه جوه tech-store.
  //
  // الشرط الصح: يبدأ بـ "/" واحد بالظبط، ومش متبوع بـ "/" أو "\" تاني.
  const redirectParam = searchParams.get("redirect");
  const redirectTo = safeNextPath(redirectParam);

  const response = NextResponse.redirect(new URL(redirectTo, request.url));
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}
