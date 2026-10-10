import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { getAppOrigin } from "@/lib/app-url";

function escapeHtml(value:string){return value.replace(/[&<>'"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]!));}

export async function GET(request:NextRequest){
 const expected=process.env.CRON_SECRET;const auth=request.headers.get("authorization");
 if(!expected||auth!==`Bearer ${expected}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 const notifications=await prisma.notification.findMany({where:{emailSentAt:null,user:{deletedAt:null}},include:{user:{select:{email:true,name:true}}},orderBy:{createdAt:"asc"},take:100});
 let sent=0,failed=0;const origin=getAppOrigin(request);
 for(const n of notifications){
  try{
   const link=n.link?`${origin}${n.link.startsWith("/")?n.link:`/${n.link}`}`:origin;
   await sendEmail({to:n.user.email,subject:`Tech Store — ${n.title}`,html:`<div style="font-family:Arial,sans-serif;line-height:1.6"><p>Hello ${escapeHtml(n.user.name)},</p><h2>${escapeHtml(n.title)}</h2><p>${escapeHtml(n.message)}</p><p><a href="${escapeHtml(link)}">Open Tech Store</a></p></div>`});
   await prisma.notification.updateMany({where:{id:n.id,emailSentAt:null},data:{emailSentAt:new Date()}});sent++;
  }catch(error){failed++;console.error(`Notification email ${n.id} failed`,error);}
 }
 return NextResponse.json({processed:notifications.length,sent,failed});
}
