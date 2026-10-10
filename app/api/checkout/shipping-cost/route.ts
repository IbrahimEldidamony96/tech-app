import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { getCartForUser } from "@/lib/queries/cart";
import { Prisma } from "@/app/generated/prisma/client";
import { resolveBostaCityIdCached, BostaApiError } from "@/lib/bosta";
import {
  getShippingFeeForCity,
  computeShippingCost,
  FREE_SHIPPING_THRESHOLD,
} from "@/lib/shipping-cost";

// بيتنادى من فورم الـ checkout كل ما اليوزر يختار عنوان محفوظ أو محافظة من
// قايمة Bosta — عشان يشوف سعر الشحن الحقيقي *قبل* ما يضغط "Place Order"،
// مش يتفاجئ بيه في صفحة الأوردر بعد ما يتعمل. بناخد subtotal من الكارت
// بتاع اليوزر نفسه على السيرفر (مش من الـ query string) — رقم بيتحسب من
// غير ما نصدّق أي حاجة جاية من الفرونت إند.
export async function GET(request: NextRequest) {
  const { session, error } = await requireUser();
  if (error) return error;
  const userId = session!.user.id;

  const addressId = request.nextUrl.searchParams.get("addressId");
  const cityId = request.nextUrl.searchParams.get("cityId");

  if (!addressId && !cityId) {
    return NextResponse.json(
      { error: "Provide either addressId or cityId" },
      { status: 400 },
    );
  }

  let bostaCityId: string;
  try {
    if (addressId) {
      const address = await prisma.address.findUnique({
        where: { id: addressId },
      });
      if (!address || address.userId !== userId) {
        return NextResponse.json(
          { error: "Address not found" },
          { status: 404 },
        );
      }
      bostaCityId = await resolveBostaCityIdCached(
        address.bostaCityId,
        address.governorate,
      );
    } else {
      // cityId هنا هو الـ Bosta cityId نفسه جاي من الـ dropdown مباشرة —
      // عنوان لسه معملوش save، فمفيش اسم نتأكد منه، الـ id ده كفاية
      bostaCityId = cityId!;
    }
  } catch (err) {
    const message =
      err instanceof BostaApiError || err instanceof Error
        ? err.message
        : "Bosta request failed";
    return NextResponse.json(
      { error: `Could not resolve shipping location: ${message}` },
      { status: 502 },
    );
  }

  const cart = await getCartForUser(userId);
  const subtotal = new Prisma.Decimal(cart.subtotal);

  const baseFee = await getShippingFeeForCity(bostaCityId);
  const { shippingCost, freeShippingApplied } = computeShippingCost(
    baseFee,
    subtotal,
  );

  return NextResponse.json({
    data: {
      subtotal: subtotal.toNumber(),
      baseFee: baseFee.toNumber(),
      shippingCost: shippingCost.toNumber(),
      freeShippingApplied,
      freeShippingThreshold: FREE_SHIPPING_THRESHOLD.toNumber(),
      total: subtotal.add(shippingCost).toNumber(),
    },
  });
}
