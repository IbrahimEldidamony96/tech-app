import { requireAdminPagePermission } from "@/lib/require-admin-page-permission";
import { getTranslations,getLocale } from "next-intl/server";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getAllCouponsForAdmin } from "@/lib/queries/admin-coupons";
import { CouponsManager } from "@/components/admin/coupons-manager";
import { localized } from "@/lib/locale";
import type { AppLocale } from "@/i18n/request";
export default async function AdminCouponsPage(){const guardedUser = await requireAdminPagePermission("marketing:read");const[coupons,categories,brands,t,locale]=await Promise.all([getAllCouponsForAdmin(),prisma.category.findMany({select:{id:true,nameEn:true,nameAr:true},orderBy:{nameEn:"asc"}}),prisma.brand.findMany({select:{id:true,name:true},orderBy:{name:"asc"}}),getTranslations("AdminCoupons"),getLocale()]);const mapped=coupons.map(c=>({id:c.id,code:c.code,type:c.type,value:c.value.toNumber(),minOrderAmount:c.minOrderAmount?.toNumber()??null,maxDiscount:c.maxDiscount?.toNumber()??null,usageLimit:c.usageLimit,usageLimitPerUser:c.usageLimitPerUser,usedCount:c.usedCount,startsAt:c.startsAt,expiresAt:c.expiresAt,isActive:c.isActive,firstOrderOnly:c.firstOrderOnly,categoryId:c.categoryId,brandId:c.brandId}));return <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8"><h1 className="font-display text-2xl font-bold text-ink">{t("title")}</h1><CouponsManager initialCoupons={mapped} categories={categories.map(c=>({id:c.id,label:localized(locale as AppLocale,c.nameEn,c.nameAr)}))} brands={brands.map(b=>({id:b.id,label:b.name}))} canWrite={hasPermission(guardedUser.role,"marketing:write")}/></div>}
