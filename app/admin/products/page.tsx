import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { getAllProductsForAdmin } from "@/lib/queries/admin-products";
import { ProductActiveToggle } from "@/components/admin/product-active-toggle";
import { ProductArchiveButton } from "@/components/admin/product-archive-button";
import { localized } from "@/lib/locale";
import type { AppLocale } from "@/i18n/request";

type SearchParams = Promise<{ archived?: string }>;
export default async function AdminProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "catalog:read")) redirect("/");
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const products = await getAllProductsForAdmin(showArchived);
  const t = await getTranslations("AdminProducts");
  const locale = (await getLocale()) as AppLocale;

  return <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-2xl font-bold text-ink">{t("title")}</h1>
      <div className="flex gap-2">
        <Link href={showArchived?"/admin/products":"/admin/products?archived=1"} className="rounded-md border border-steel/25 px-4 py-2 text-sm">{showArchived?"Hide archived":"Show archived"}</Link>
        {hasPermission(session.user.role,"catalog:write")&&<Link href="/admin/products/new" className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper">{t("newProduct")}</Link>}
      </div>
    </div>
    <div className="mt-6 overflow-x-auto rounded-lg border border-steel/15"><table className="w-full min-w-[760px] text-sm">
      <thead className="bg-steel/5 text-xs uppercase tracking-wide text-steel"><tr><th className="px-4 py-2"></th><th className="px-4 py-2 text-start">{t("name")}</th><th className="px-4 py-2 text-start">{t("category")}</th><th className="px-4 py-2 text-start">{t("brand")}</th><th className="px-4 py-2 text-start">{t("stock")}</th><th className="px-4 py-2 text-start">{t("status")}</th><th className="px-4 py-2"></th></tr></thead>
      <tbody className="divide-y divide-steel/10">{products.map(p=>{const totalStock=p.variants.reduce((sum,v)=>sum+v.stock,0);const thumbnail=p.images[0];return <tr key={p.id} className={p.deletedAt?"opacity-55":""}>
        <td className="px-4 py-3"><div className="relative h-10 w-10 overflow-hidden rounded bg-steel/5">{thumbnail?<Image src={thumbnail.url} alt="" fill className="object-cover" sizes="40px"/>:<div className="flex h-full items-center justify-center text-[9px] text-steel">{t("noImage")}</div>}</div></td>
        <td className="px-4 py-3 text-ink">{localized(locale,p.nameEn,p.nameAr)}{p.deletedAt&&<span className="ms-2 rounded bg-alert/10 px-1.5 py-0.5 text-[10px] text-alert">Archived</span>}</td>
        <td className="px-4 py-3 text-steel">{localized(locale,p.category.nameEn,p.category.nameAr)}</td><td className="px-4 py-3 text-steel">{p.brand?.name??t("noBrand")}</td><td className="px-4 py-3 font-mono text-steel">{totalStock}</td>
        <td className="px-4 py-3">{!p.deletedAt&&hasPermission(session.user.role,"catalog:write")?<ProductActiveToggle productId={p.id} initialActive={p.isActive}/>:<span className="text-xs text-steel">{p.deletedAt?"Archived":p.isActive?"Active":"Inactive"}</span>}</td>
        <td className="px-4 py-3 text-end"><div className="flex justify-end gap-3"><Link href={`/admin/products/${p.id}/edit`} className="text-xs text-ink hover:underline">{t("edit")}</Link>{hasPermission(session.user.role,"catalog:write")&&<ProductArchiveButton productId={p.id} archived={!!p.deletedAt}/>}</div></td>
      </tr>})}</tbody>
    </table></div>
  </div>;
}
