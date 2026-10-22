import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ProductCard } from "@/components/product-card";
import { getRecentlyViewed } from "@/lib/queries/recently-viewed";
import { isSaleActive } from "@/lib/product-pricing";
import type { AppLocale } from "@/i18n/request";
export default async function RecentPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const locale = (await getLocale()) as AppLocale;
  const rows = await getRecentlyViewed(session.user.id);
  return <main className="mx-auto max-w-6xl px-4 py-10">
    <h1 className="text-2xl font-bold">{locale === "ar" ? "شاهدته مؤخراً" : "Recently Viewed"}</h1>
    <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {rows.map(({ product }) => <ProductCard key={product.id} locale={locale} product={{ ...product,
        variants: product.variants.map(v => ({ price: v.price.toNumber(), salePrice: v.salePrice?.toNumber() ?? null, saleActive: isSaleActive(v), stock: v.stock })),
      }} />)}
    </div>
  </main>;
}
