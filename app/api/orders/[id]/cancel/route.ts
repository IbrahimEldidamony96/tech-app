import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { cancelBeforeDispatch } from "@/lib/cancel-before-dispatch";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireUser();
  if (error) return error;
  const { id } = await params;
  const order = await prisma.order.findFirst({ where: { id, userId: session!.user.id }, select: { id: true } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const result = await cancelBeforeDispatch(id, ["PENDING", "CONFIRMED"]);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: { id, status: "CANCELLED" } });
}
