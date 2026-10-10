import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { canTransitionShipment } from "@/lib/order-state-machine";
import { cancelOrderAndRestock } from "@/lib/order-cancellation";
import { cancelBostaDelivery } from "@/lib/bosta";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("orders:write");
  if (error) return error;

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, shipment: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // compare-and-set + رجوع المخزون + تحرير الكوبون — نفس اللوجيك
  // مستخدم كمان في إلغاء العميل وفي job انتهاء صلاحية الأوردرات، فاتحط
  // في مكان واحد (lib/order-cancellation.ts) بدل ما يتكرر في التلاتة
  const succeeded = await cancelOrderAndRestock(order);

  if (!succeeded) {
    return NextResponse.json(
      { error: `Cannot cancel an order with status ${order.status}` },
      { status: 409 },
    );
  }

  // إلغاء الشحنة عند Bosta بعد ما الإلغاء المحلي نجح، مش قبله ولا جوه
  // نفس الـ transaction — لو Bosta رفضت (مثلاً الشحنة اتحركت فعلاً)
  // إحنا مش عايزين ده يمنع إلغاء الأوردر عندنا، بس الأدمن لازم ياخد باله
  //
  // *** باج كان موجود: لو Bosta وافقت على الإلغاء، shipment.status عندنا
  // كان بيفضل زي ما هو (PENDING/PREPARING) للأبد — صفحة الأدمن كانت بتفضل
  // عارضة حالة قديمة غلط حتى بعد ما الشحنة اتلغت فعليًا عند Bosta. الحالة
  // دي (canTransitionOrder سمحت بالإلغاء) معناها shipment.status لازم
  // يكون PENDING أو PREPARING بالظبط (SHIPPED/IN_TRANSIT/DELIVERED كانت
  // هتخلي order.status يبقى SHIPPED/DELIVERED من الأول، واللي كان هيمنع
  // canTransitionOrder(..., "CANCELLED") فوق) — يعني التحويل لـ RETURNED
  // مضمون إنه صالح دايمًا هنا (SHIPMENT_TRANSITIONS بيسمح بيه من الاتنين).
  let bostaWarning: string | undefined;
  const shipmentAfterCancel = await prisma.shipment.findUnique({
    where: { orderId: id },
  });
  if (shipmentAfterCancel?.bostaDeliveryId) {
    try {
      await cancelBostaDelivery(shipmentAfterCancel.bostaDeliveryId);
      if (canTransitionShipment(shipmentAfterCancel.status, "RETURNED")) {
        await prisma.shipment.update({
          where: { orderId: id },
          data: { status: "RETURNED" },
        });
      }
    } catch (err) {
      bostaWarning =
        "Order cancelled locally, but Bosta could not cancel the delivery (it may already be picked up) — check the Bosta dashboard manually.";
      console.warn("Bosta cancelDelivery failed", err);
    }
  }

  return NextResponse.json({
    data: { id, status: "CANCELLED" },
    warning: bostaWarning,
  });
}
