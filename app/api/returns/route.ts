import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { createNotification } from "@/lib/notifications";

const schema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
  customerNote: z.string().trim().max(1000).optional(),
  items: z.array(z.object({ orderItemId: z.string().min(1), quantity: z.number().int().min(1) })).min(1),
});

export async function GET() {
  const { session, error } = await requireUser(); if (error) return error;
  const data = await prisma.returnRequest.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
    include: { items: { include: { orderItem: { select: { productName: true, sku: true, quantity: true, unitPrice: true } } } }, order: { select: { id: true, createdAt: true, paymentStatus: true } } },
  });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const { session, error } = await requireUser(); if (error) return error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid return request", issues: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  if (new Set(input.items.map(i=>i.orderItemId)).size !== input.items.length) return NextResponse.json({ error: "Duplicate order items are not allowed" }, { status: 400 });

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, userId: session!.user.id, status: "DELIVERED" },
    include: { items: true },
  });
  if (!order) return NextResponse.json({ error: "Delivered order not found" }, { status: 404 });

  const requestedIds = input.items.map(i=>i.orderItemId);
  const existing = await prisma.returnItem.groupBy({
    by: ["orderItemId"],
    where: { orderItemId: { in: requestedIds }, returnRequest: { status: { in: ["REQUESTED","APPROVED","RECEIVED","REFUNDED"] } } },
    _sum: { quantity: true },
  });
  const already = new Map(existing.map(r=>[r.orderItemId,r._sum.quantity??0]));
  for (const item of input.items) {
    const source = order.items.find(i=>i.id===item.orderItemId);
    if (!source) return NextResponse.json({ error: "One of the items does not belong to this order" }, { status: 400 });
    if ((already.get(item.orderItemId)??0) + item.quantity > source.quantity) return NextResponse.json({ error: `Return quantity exceeds purchased quantity for ${source.productName}` }, { status: 409 });
  }

  const created = await prisma.$transaction(async tx => {
    const rr = await tx.returnRequest.create({
      data: {
        orderId: order.id, userId: session!.user.id, reason: input.reason, customerNote: input.customerNote,
        items: { create: input.items.map(i=>({ orderItemId:i.orderItemId, quantity:i.quantity, variantId:order.items.find(x=>x.id===i.orderItemId)!.variantId })) },
      },
      include: { items: true },
    });
    await createNotification(tx,{userId:session!.user.id,type:"ORDER",title:"Return requested",message:`Return request ${rr.id} was submitted.`,link:"/account/returns"});
    return rr;
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
