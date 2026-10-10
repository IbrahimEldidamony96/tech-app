import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ProductCard } from "@/components/product-card";
import { getLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/request";
export const dynamic="force-dynamic";
export default async function RecentPage(){const s=await auth();if(!s?.user)redirect('/login');const locale=(await getLocale()) as AppLocale;const rows=await prisma.recentlyViewed.findMany({where:{userId:s.user.id},orderBy:{viewedAt:'desc'},take:30,include:{product:{select:{id:true,nameEn:true,nameAr:true,slug:true,brand:{select:{name:true}},images:{where:{isPrimary:true},take:1,select:{url:true,alt:true}},variants:{where:{isActive:true},orderBy:{price:'asc'},take:1,select:{price:true,stock:true}}}}}});return <main className="mx-auto max-w-6xl px-4 py-10"><h1 className="text-2xl font-bold">Recently Viewed</h1><div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{rows.map(({product})=><ProductCard key={product.id} locale={locale} product={{...product,variants:product.variants.map(v=>({price:v.price.toNumber(),stock:v.stock}))}}/>)}</div></main>}
