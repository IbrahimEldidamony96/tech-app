import type {
  OrderStatus,
  PaymentStatus,
  ShipmentStatus,
} from "@/app/generated/prisma/client";

// كل حالة → مسموح تتحول لإيه بس. أي انتقال مش موجود في القايمة = مرفوض.
// ده اللي بيمنع مثلاً "تسليم أوردر لسه PENDING" أو "استرجاع فلوس أوردر
// أصلاً معملوش دفع" — أخطاء منطقية، مش أخطاء تقنية، فمينفعش الداتابيز
// وحدها تمنعها (enum بيسمح بأي قيمة)، لازم قاعدة عمل صريحة زي دي.

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  // *** باج كان موجود: SHIPPED كان بيسمح بـ DELIVERED بس. لو Bosta رجّعت
  // حالة الشحنة RETURNED (فشل التسليم 3 مرات، فقدان، تلف، أو إلغاء من
  // عندهم — أكواد 48/49/100/101)، مفيش أي transition شرعي يودّي الأوردر
  // لأي حالة تانية — كان بيفضل SHIPPED للأبد حتى لو البضاعة رجعت فعليًا
  // والمخزون معندوش أي طريقة يترجع بيها. CANCELLED هي أقرب حالة موجودة
  // فعلًا تمثّل "الأوردر ده مكملش"، وهي أصلًا بتشغّل نفس منطق رجوع
  // المخزون المستخدم في كل حالات الإلغاء التانية.
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ["PAID", "FAILED"],
  PAID: ["PARTIALLY_REFUNDED", "REFUNDED"],
  PARTIALLY_REFUNDED: ["REFUNDED"],
  FAILED: [],
  REFUNDED: [],
};

const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  // PENDING/PREPARING → RETURNED مضافة عشان Bosta ممكن تلغي الشحنة قبل
  // حتى ما تتحرك من المخزن (مثلاً العميل رفض الاستلام بدري أو في مشكلة
  // في العنوان)، مش بس بعد ما تطلع فعليًا
  PENDING: ["PREPARING", "RETURNED"],
  PREPARING: ["SHIPPED", "RETURNED"],
  SHIPPED: ["IN_TRANSIT", "RETURNED"],
  IN_TRANSIT: ["DELIVERED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  RETURNED: [],
};

export function canTransitionOrder(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}
export function canTransitionPayment(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}
export function canTransitionShipment(
  from: ShipmentStatus,
  to: ShipmentStatus,
): boolean {
  return SHIPMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

// *** باج كان موجود في كل route بيغيّر حالة أوردر (cancel، mark-failed،
// shipment...): كان بيقرا الحالة الحالية، يتحقق canTransitionOrder عليها،
// وبعدين — في statement منفصل تمامًا — يعمل update بدون أي شرط. لو
// اتنين طلبوا نفس الـ endpoint في نفس اللحظة (دبل كليك، تابين مفتوحين)،
// الاتنين بيقروا نفس الحالة القديمة، الاتنين بيعدّوا الفحص، والاتنين
// بيعملوا update — يعني مثلاً المخزون يترجع مرتين لنفس الأوردر.
//
// الحل العام: أي update لحالة لازم يكون compare-and-set — نفس مبدأ خصم
// المخزون بالظبط (updateMany بشرط، مش findUnique ثم update). الدوال دي
// بترجع كل الحالات اللي *مسموح* منها توصل لحالة معينة، عشان تتحط في
// where: { status: { in: [...] } } — لو حد تاني سبقك وغيّر الحالة،
// الـ update مش هيلاقي صف يطابق الشرط (count=0)، وده الإشارة إنك خسرت
// السباق، مش إنك تكمل عادي.
export function orderStatusesThatCanReach(to: OrderStatus): OrderStatus[] {
  return (Object.keys(ORDER_TRANSITIONS) as OrderStatus[]).filter((from) =>
    ORDER_TRANSITIONS[from].includes(to),
  );
}
export function paymentStatusesThatCanReach(
  to: PaymentStatus,
): PaymentStatus[] {
  return (Object.keys(PAYMENT_TRANSITIONS) as PaymentStatus[]).filter(
    (from) => PAYMENT_TRANSITIONS[from].includes(to),
  );
}
