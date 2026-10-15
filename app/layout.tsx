import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import "./globals.css";

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair-display",
  weight: "variable",
  style: ["normal", "italic"],
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Tech Store",
  description: "Phones, laptops, and accessories.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // اللغة جاية من كوكي NEXT_LOCALE (شوف i18n/request.ts) — مفيش [locale]
  // segment في الـ URL. getLocale()/getMessages() بيقروا نفس الـ request
  // config، فمضمون يبقوا متزامنين مع بعض.
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations("Storefront");
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html
      suppressHydrationWarning
      lang={locale}
      dir={dir}
      className={`${playfairDisplay.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head><script dangerouslySetInnerHTML={{__html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`}} /></head>
      <body className="flex min-h-screen flex-col font-body antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-accent focus:px-5 focus:py-3 focus:text-paper">{t("skipToContent")}</a>
          <Header />
          {/* SessionProvider نفسه client component جوّاه (next-auth بيحطها)،
              فعادي نرندره من Server Component هنا من غير ما نلف الملف كله.
              محتاجينه عشان useSession().update() يشتغل بعد تعديل البروفايل */}
          <SessionProvider>
            <main id="main-content" className="flex-1" tabIndex={-1}>{children}</main>
          </SessionProvider>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
