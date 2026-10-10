import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { hasPermission } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      payment: true,
      shipment: true,
      coupon: { select: { code: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // نفس مبدأ فحص الملكية تاني — بس هنا بفرق واحد: الأدمن مسموحله يشوف
  // أي أوردر (هيستخدمها في Phase 8)، العميل العادي بيشوف بتاعه هو بس
  if (order.userId !== session!.user.id && !hasPermission(session!.user.role, "orders:read")) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ data: order });
}
