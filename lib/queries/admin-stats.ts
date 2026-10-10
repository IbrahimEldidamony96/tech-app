import { prisma } from "@/lib/prisma";

export type RevenueRange = "today" | "7d" | "30d";
const STORE_TIMEZONE="Africa/Cairo";
function getTimeZoneOffsetMs(date:Date,timeZone:string){const parts=new Intl.DateTimeFormat("en-US",{timeZone,hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).formatToParts(date);const get=(type:string)=>Number(parts.find(p=>p.type===type)!.value);const localAsUtc=Date.UTC(get("year"),get("month")-1,get("day"),get("hour"),get("minute"),get("second"));return localAsUtc-Math.floor(date.getTime()/1000)*1000;}
function startOfDayInTimeZone(now:Date,timeZone:string){const parts=new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);const get=(type:string)=>Number(parts.find(p=>p.type===type)!.value);const localMidnightAsUtc=Date.UTC(get("year"),get("month")-1,get("day"));let result=localMidnightAsUtc-getTimeZoneOffsetMs(new Date(localMidnightAsUtc),timeZone);result=localMidnightAsUtc-getTimeZoneOffsetMs(new Date(result),timeZone);return new Date(result);}
export function getRangeStart(range:RevenueRange,now:Date=new Date()){if(range==="today")return startOfDayInTimeZone(now,STORE_TIMEZONE);const days=range==="7d"?7:30;return new Date(now.getTime()-days*86400000);}
function cairoDayKey(date:Date){return new Intl.DateTimeFormat("en-CA",{timeZone:STORE_TIMEZONE,year:"numeric",month:"2-digit",day:"2-digit"}).format(date);}

export async function getAdminStats(revenueRange:RevenueRange="30d"){
 const rangeStart=getRangeStart(revenueRange); const now=new Date();
 const [orders,pendingOrders,lowStockVariants,newCustomers,statusGroups,topItems]=await Promise.all([
  prisma.order.findMany({where:{createdAt:{gte:rangeStart},status:{not:"CANCELLED"}},select:{createdAt:true,total:true}}),
  prisma.order.count({where:{status:"PENDING"}}),
  prisma.productVariant.count({where:{isActive:true,stock:{lte:5},product:{deletedAt:null}}}),
  prisma.user.count({where:{role:"CUSTOMER",createdAt:{gte:rangeStart},deletedAt:null}}),
  prisma.order.groupBy({by:["status"],where:{createdAt:{gte:rangeStart}},_count:{_all:true}}),
  prisma.orderItem.groupBy({by:["variantId"],where:{order:{createdAt:{gte:rangeStart},status:{not:"CANCELLED"}}},_sum:{quantity:true},orderBy:{_sum:{quantity:"desc"}},take:5}),
 ]);
 const revenue=orders.reduce((sum,o)=>sum+o.total.toNumber(),0);
 const dailyMap=new Map<string,{revenue:number;orders:number}>();
 for(const o of orders){const key=cairoDayKey(o.createdAt);const row=dailyMap.get(key)??{revenue:0,orders:0};row.revenue+=o.total.toNumber();row.orders++;dailyMap.set(key,row);}
 const days=revenueRange==="today"?1:revenueRange==="7d"?7:30; const dailyRevenue=[] as {date:string;revenue:number;orders:number}[];
 for(let i=days-1;i>=0;i--){const d=new Date(now.getTime()-i*86400000);const key=cairoDayKey(d);dailyRevenue.push({date:key,...(dailyMap.get(key)??{revenue:0,orders:0})});}
 const variants=topItems.length?await prisma.productVariant.findMany({where:{id:{in:topItems.map(x=>x.variantId)}},select:{id:true,sku:true,product:{select:{nameEn:true}}}}):[];
 const variantMap=new Map(variants.map(v=>[v.id,v]));
 const topProducts=topItems.map(x=>({variantId:x.variantId,name:variantMap.get(x.variantId)?.product.nameEn??"Unknown",sku:variantMap.get(x.variantId)?.sku??"",quantity:x._sum.quantity??0}));
 return {revenue,ordersInRange:orders.length,pendingOrders,lowStockVariants,newCustomers,averageOrderValue:orders.length?revenue/orders.length:0,statusCounts:Object.fromEntries(statusGroups.map(g=>[g.status,g._count._all])),dailyRevenue,topProducts};
}
