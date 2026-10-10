import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { shippingRateUpsertSchema } from "@/lib/validations/shipping-rate";

// POST بيعمل upsert دايمًا (مش create بس) — الصف مربوط بمحافظة Bosta
// حقيقية موجودة أصلاً (مش بيتعمل حاجة جديدة من الصفر زي البراند مثلاً)،
// فمفيش داعي الفرونت إند يفرّق بين "لسه معملهاش سعر" و"بيعدّل سعر موجود".
export async function POST(request: NextRequest) {
  const { error } = await requirePermission("settings:manage");
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = shippingRateUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { bostaCityId, cityNameEn, cityNameAr, fee, isActive } = parsed.data;

  const rate = await prisma.shippingRate.upsert({
    where: { bostaCityId },
    create: { bostaCityId, cityNameEn, cityNameAr, fee, isActive },
    update: { cityNameEn, cityNameAr, fee, isActive },
  });

  return NextResponse.json({ data: rate }, { status: 201 });
}
