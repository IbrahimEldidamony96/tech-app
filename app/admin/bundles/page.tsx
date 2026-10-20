import { requireAdminPagePermission } from "@/lib/require-admin-page-permission";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { BundleManager } from "@/components/admin/bundle-manager";
import { DeleteBundleButton } from "@/components/admin/delete-bundle-button";

export const dynamic="force-dynamic";
export default async function BundlesPage(){
 const guardedUser = await requireAdminPagePermission("marketing:read");
 const [bundles,products]=await Promise.all([
  prisma.bundle.findMany({include:{items:{include:{product:{select:{nameEn:true,slug:true}}}}},orderBy:{createdAt:"desc"}}),
  prisma.product.findMany({where:{isActive:true,deletedAt:null},select:{id:true,nameEn:true},orderBy:{nameEn:"asc"},take:500}),
 ]);
 return <main className="mx-auto max-w-5xl px-4 py-10"><div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-ink">Product Bundles</h1><p className="mt-1 text-sm text-steel">Bundle discounts are validated and calculated server-side at checkout.</p></div>{hasPermission(guardedUser.role,"marketing:write")?<BundleManager products={products}/>:null}</div>
 <div className="mt-6 grid gap-4">{bundles.map(b=><article key={b.id} className="rounded-lg border border-steel/15 p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-ink">{b.nameEn}</h2><p className="text-xs text-steel">/{b.slug} · {b.isActive?"Active":"Inactive"}</p></div><div className="flex items-center gap-3"><span className="rounded bg-steel/10 px-2 py-1 text-xs">{b.discountType} {b.discountValue.toString()}</span>{hasPermission(guardedUser.role,"marketing:write")?<DeleteBundleButton id={b.id}/>:null}</div></div><ul className="mt-3 list-inside list-disc text-sm text-steel">{b.items.map(i=><li key={i.id}>{i.quantity} × {i.product.nameEn}</li>)}</ul></article>)}{bundles.length===0?<p className="rounded border border-dashed border-steel/30 p-6 text-sm text-steel">No bundles yet.</p>:null}</div></main>;
}
