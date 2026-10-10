import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { effectiveVariantPrice, isSaleActive } from "@/lib/product-pricing";

const schema=z.object({items:z.array(z.object({variantId:z.string().min(1),quantity:z.number().int().min(1).max(10)})).max(50)});
export async function POST(request:Request){
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Invalid cart"},{status:400});
 const ids=[...new Set(parsed.data.items.map(i=>i.variantId))];
 const variants=await prisma.productVariant.findMany({where:{id:{in:ids}},select:{id:true,sku:true,price:true,salePrice:true,saleStartsAt:true,saleEndsAt:true,stock:true,isActive:true,optionValues:{select:{optionValue:{select:{valueEn:true,valueAr:true}}}},product:{select:{id:true,nameEn:true,nameAr:true,slug:true,isActive:true,deletedAt:true,images:{where:{isPrimary:true},take:1,select:{url:true}}}}}});
 const map=new Map(variants.map(v=>[v.id,v]));
 const data=parsed.data.items.map(item=>{const v=map.get(item.variantId);if(!v)return {variantId:item.variantId,quantity:item.quantity,unavailable:true};const price=effectiveVariantPrice(v).toNumber();return {variantId:v.id,quantity:item.quantity,sku:v.sku,price,regularPrice:v.price.toNumber(),saleActive:isSaleActive(v),stock:v.stock,unavailable:!v.isActive||!v.product.isActive||!!v.product.deletedAt,optionSummaryEn:v.optionValues.map(x=>x.optionValue.valueEn).join(' / '),optionSummaryAr:v.optionValues.map(x=>x.optionValue.valueAr).join(' / '),product:{id:v.product.id,nameEn:v.product.nameEn,nameAr:v.product.nameAr,slug:v.product.slug,images:v.product.images}}});
 return NextResponse.json({data});
}
