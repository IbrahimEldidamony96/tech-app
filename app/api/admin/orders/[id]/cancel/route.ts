import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { cancelBeforeDispatch } from "@/lib/cancel-before-dispatch";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("orders:write");
  if (guard.error) return guard.error;
  const { id } = await params;
  if (!await prisma.order.findUnique({ where: { id }, select: { id: true } })) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  const result = await cancelBeforeDispatch(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: { id, status: "CANCELLED" } });
}
