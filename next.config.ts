import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// بنستخدم next-intl من غير الـ [locale] segment في الـ URL (يعني مفيش
// /en/... أو /ar/...) — اللغة دي تفضيل مخزّن في كوكي (NEXT_LOCALE)، مش
// جزء من الـ routing. ده قرار متعمد: المشروع فيه عشرات الـ routes الديناميكية
// ([id], [slug]) بالفعل، وإضافة [locale] فوقها كانت هتضاعف كل مجلد وتفتح
// مشاكل PowerShell/bracket من الأول. next-intl بيدعم الشكل ده رسمي:
// راجع i18n/request.ts.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  typedRoutes: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co" },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
