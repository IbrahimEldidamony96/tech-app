import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
function valid(raw:string,hash:string){const a=Buffer.from(createHash('sha256').update(raw).digest('hex'));const b=Buffer.from(hash);return a.length===b.length&&timingSafeEqual(a,b)}
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){const {id}=await params;const token=request.nextUrl.searchParams.get('token')??'';const order=await prisma.order.findUnique({where:{id},include:{items:true,payment:true,shipment:true,events:{orderBy:{createdAt:'asc'}}}});if(!order?.guestAccessTokenHash||!token||!valid(token,order.guestAccessTokenHash))return NextResponse.json({error:'Order not found'},{status:404});return NextResponse.json({data:order});}
