import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";

type Params = { params: Promise<{ id: string }> };

// بيمسح الـ override بتاع المحافظة دي — مش بيوقف الشحن ليها، الأوردرات
// اللي عليها هترجع تستخدم DEFAULT_SHIPPING_FEE لحد ما حد يحط سعر تاني
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("settings:manage");
  if (error) return error;

  const { id } = await params;

  const rate = await prisma.shippingRate.findUnique({ where: { id } });
  if (!rate) {
    return NextResponse.json({ error: "Rate not found" }, { status: 404 });
  }

  await prisma.shippingRate.delete({ where: { id } });

  return NextResponse.json({ data: { id } });
}
