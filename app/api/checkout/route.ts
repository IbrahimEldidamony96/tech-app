import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { checkoutSchema } from "@/lib/validations/checkout";
import { CheckoutError } from "@/lib/checkout-errors";
import { Prisma } from "@/app/generated/prisma/client";
import {
  createIntention,
  paymobCheckoutUrl,
  PaymobApiError,
} from "@/lib/paymob";
import {
  resolveBostaCityIdCached,
  resolveBostaDistrictIdCached,
  BostaApiError,
} from "@/lib/bosta";
import { computeShippingCost, DEFAULT_SHIPPING_FEE } from "@/lib/shipping-cost";
import { getAppOrigin } from "@/lib/app-url";
import { effectiveVariantPrice } from "@/lib/product-pricing";
import { calculateBundleDiscount } from "@/lib/bundle-discount";
import { changeLoyaltyPoints } from "@/lib/loyalty";
import { createNotification } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  const { session, error } = await requireUser();
  if (error) return error;
  const userId = session!.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { addressId, couponCode, paymentMethod, customerNote, loyaltyPointsToRedeem, checkoutKey } = parsed.data;

  // *** فحص ملكية العنوان — نفس مبدأ IDOR من Phase 4 ***
  const address = await prisma.address.findUnique({ where: { id: addressId } });
  if (!address || address.userId !== userId) {
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }

  // مفيش قراءة للكارت هنا قبل الـ transaction. لو قريناه بره، طلبين
  // checkout متزامنين لنفس اليوزر ممكن يشوفوا نفس العناصر ويعملوا أوردرين.
  // بنقفل صف Cart نفسه FOR UPDATE داخل الـ transaction، وبعد القفل نقرأ
  // العناصر؛ الطلب الثاني يستنى الأول، وبعد commit هيلاقي الكارت فاضي.

  // *** بنحل الـ Bosta cityId بتاع العنوان ده قبل الـ transaction، مش
  // جواها *** — نفس مبدأ نداء Paymob تحت بالظبط: نداء شبكة خارجي (Bosta)
  // مالوش داعي يمسك قفل/connection من الداتابيز، ولو فشل (اسم محافظة قديم
  // مبقاش موجود عند Bosta مثلاً) نفشل بدري وواضح قبل ما نلمس أي حاجة.
  // الأوردر هو المصدر الوحيد لسعر الشحن الرسمي (مش الـ preview endpoint)،
  // فلازم نعمل نفس الحل ده هنا حتى لو العميل شاف السعر قبل كده.
  let shippingBostaCityId: string;
  let shippingBostaDistrictId: string;
  try {
    shippingBostaCityId = await resolveBostaCityIdCached(
      address.bostaCityId,
      address.governorate,
    );
    shippingBostaDistrictId = await resolveBostaDistrictIdCached(
      address.bostaDistrictId,
      shippingBostaCityId,
      address.city,
    );
  } catch (err) {
    const message =
      err instanceof BostaApiError || err instanceof Error
        ? err.message
        : "Bosta request failed";
    return NextResponse.json(
      {
        error: `Could not resolve your shipping location with Bosta: ${message}. Please re-select your address.`,
      },
      { status: 502 },
    );
  }

  // ملحوظة عن سباق الكوبون: فحص حد استخدام الكوبون للعميل الواحد
  // (usageLimitPerUser) هو count() عادي بعده update، مش compare-and-set
  // مباشر زي المخزون — نظريًا ده شكل race classic (write skew). لكن
  // اتأكد فعليًا بالاختبار (طلبين checkout متزامنين لنفس اليوزر ونفس
  // الكوبون) إن ده مش قابل للتكرار هنا عمليًا: نفس اليوزر له عربة واحدة
  // بس (Cart.userId @unique)، وخصم المخزون فوق بيقفل صف الـ variant
  // الأول قبل ما يوصل لفحص الكوبون أصلاً — فالمعاملة التانية مستحيل
  // تكمل لفحص الكوبون قبل ما الأولى تخلّص (commit) بالكامل. جرّبت
  // إضافة isolationLevel: Serializable + إعادة محاولة كحل احترازي، بس
  // شلتها تاني: بتكلفة أداء حقيقية (معاملات أكتر عرضة تفشل بالغلط تحت
  // ضغط) من غير أي فايدة فعلية للسيناريو ده بالذات.
  try {
    const checkoutResult = await prisma.$transaction(
        async (tx) => {
        // ---------- 0. Claim the user's cart atomically ----------
        // Cart.userId @unique، لذلك قفل الصف ده يسلسل أي checkout لنفس
        // المستخدم من غير ما يمنع مستخدمين مختلفين من الشراء بالتوازي.
        await tx.$queryRaw`SELECT id FROM "Cart" WHERE "userId" = ${userId} FOR UPDATE`;

        if (checkoutKey) {
          const existingOrder = await tx.order.findFirst({
            where: { checkoutKey, userId },
            select: { id: true, total: true, subtotal: true, discount: true, status: true, createdAt: true },
          });
          if (existingOrder) return { order: existingOrder, existing: true };
        }

        const cart = await tx.cart.findUnique({
          where: { userId },
          include: { items: true },
        });
        if (!cart || cart.items.length === 0) {
          throw new CheckoutError("EMPTY_CART", "Cart is empty");
        }

        // ترتيب ثابت للأقفال على الـ variants يمنع deadlocks بين طلبات
        // مستخدمين مختلفين عندهم نفس العناصر بترتيب مختلف.
        const sortedItems = [...cart.items].sort((a, b) =>
          a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0,
        );

        // ---------- 1. لكل عنصر: قفل السعر + خصم المخزون بشكل ذرّي ----------
        // بنقرأ الـ variant من جوه الترانزاكشن (مش من بيانات الكارت
        // القديمة) عشان السعر يبقى هو الحقيقي لحظة الدفع بالظبط.
        const orderItemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];
        const pricedItems: { productId: string; categoryId: string; brandId: string | null; quantity: number; lineTotal: Prisma.Decimal }[] = [];
        const inventorySnapshots: { variantId: string; quantity: number; stockAfter: number }[] = [];
        let subtotal = new Prisma.Decimal(0);

        for (const item of sortedItems) {
          const variant = await tx.productVariant.findUnique({
            where: { id: item.variantId },
            include: { product: { select: { id: true, nameEn: true, isActive: true, categoryId: true, brandId: true } } },
          });

          if (!variant || !variant.isActive || !variant.product.isActive) {
            throw new CheckoutError(
              "PRODUCT_UNAVAILABLE",
              "One of the products is no longer available",
            );
          }

          // *** التحديث الذرّي — العمود الفقري لمنع الـ overselling ***
          // الشرط والتحديث في statement واحد. لو اتنين طلبوا في نفس
          // اللحظة، Postgres بيسلسلهم؛ التاني بيعيد تقييم الشرط على
          // القيمة الجديدة ويفشل (count=0) لو المخزون معادش كفاية.
          const stockUpdate = await tx.productVariant.updateMany({
            where: { id: item.variantId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });

          if (stockUpdate.count === 0) {
            throw new CheckoutError(
              "OUT_OF_STOCK",
              `Insufficient stock for ${variant.product.nameEn} (SKU: ${variant.sku})`,
            );
          }

          const unitPrice = effectiveVariantPrice(variant);
          const totalPrice = unitPrice.mul(item.quantity);
          subtotal = subtotal.add(totalPrice);
          const stockAfterRow = await tx.productVariant.findUniqueOrThrow({ where: { id: variant.id }, select: { stock: true } });
          inventorySnapshots.push({ variantId: variant.id, quantity: item.quantity, stockAfter: stockAfterRow.stock });
          pricedItems.push({ productId: variant.product.id, categoryId: variant.product.categoryId, brandId: variant.product.brandId, quantity: item.quantity, lineTotal: totalPrice });

          orderItemsData.push({
            variant: { connect: { id: variant.id } },
            quantity: item.quantity,
            productName: variant.product.nameEn, // TODO: يتحدد حسب locale الطلب لما يبقى فيه فرونت إند
            sku: variant.sku,
            unitPrice,
            totalPrice,
          });
        }

        // ---------- 2. Bundle + coupon + loyalty discounts ----------
        let discount = new Prisma.Decimal(0);
        let couponId: string | null = null;

        const now = new Date();
        const bundles = await tx.bundle.findMany({
          where: {
            isActive: true,
            OR: [{ startsAt: null }, { startsAt: { lte: now } }],
            AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
            items: { some: { productId: { in: pricedItems.map((i) => i.productId) } } },
          },
          include: { items: true },
        });
        // A bundle is applied at most once per checkout, on exactly its required
        // product quantities; unrelated products cannot inflate the discount.
        let bestBundleDiscount = new Prisma.Decimal(0);
        for (const bundle of bundles) {
          const candidate = calculateBundleDiscount(bundle, pricedItems);
          if (candidate.gt(bestBundleDiscount)) bestBundleDiscount = candidate;
        }
        discount = discount.add(bestBundleDiscount);

        if (couponCode) {
          const coupon = await tx.coupon.findUnique({
            where: { code: couponCode },
          });

          if (!coupon || !coupon.isActive) {
            throw new CheckoutError(
              "INVALID_COUPON",
              "Coupon not found or inactive",
            );
          }

          if (coupon.startsAt && coupon.startsAt > now) {
            throw new CheckoutError(
              "INVALID_COUPON",
              "Coupon is not active yet",
            );
          }
          if (coupon.expiresAt && coupon.expiresAt < now) {
            throw new CheckoutError("INVALID_COUPON", "Coupon has expired");
          }
          if (coupon.firstOrderOnly) {
            const previousOrders = await tx.order.count({ where: { userId, status: { not: "CANCELLED" } } });
            if (previousOrders > 0) throw new CheckoutError("INVALID_COUPON", "Coupon is for first orders only");
          }

          let couponBase = subtotal;
          if (coupon.categoryId) couponBase = pricedItems.filter((i) => i.categoryId === coupon.categoryId).reduce((sum, i) => sum.add(i.lineTotal), new Prisma.Decimal(0));
          if (coupon.brandId) couponBase = pricedItems.filter((i) => i.brandId === coupon.brandId).reduce((sum, i) => sum.add(i.lineTotal), new Prisma.Decimal(0));
          if (couponBase.lte(0)) throw new CheckoutError("INVALID_COUPON", "Coupon does not apply to items in this cart");
          if (coupon.minOrderAmount && couponBase.lt(coupon.minOrderAmount)) {
            throw new CheckoutError("INVALID_COUPON", "Eligible items are below the coupon minimum");
          }

          const priorUsage = await tx.order.count({
            where: {
              userId,
              couponId: coupon.id,
              status: { not: "CANCELLED" },
            },
          });
          if (priorUsage >= coupon.usageLimitPerUser) {
            throw new CheckoutError(
              "INVALID_COUPON",
              "You've already used this coupon",
            );
          }

          // نفس نمط التحديث الذرّي بتاع المخزون، بس على usedCount —
          // نفس المشكلة بالظبط (عداد له سقف تحت ضغط تزامن)
          if (coupon.usageLimit !== null) {
            const couponUpdate = await tx.coupon.updateMany({
              where: { id: coupon.id, usedCount: { lt: coupon.usageLimit } },
              data: { usedCount: { increment: 1 } },
            });
            if (couponUpdate.count === 0) {
              throw new CheckoutError(
                "INVALID_COUPON",
                "Coupon usage limit reached",
              );
            }
          } else {
            await tx.coupon.update({
              where: { id: coupon.id },
              data: { usedCount: { increment: 1 } },
            });
          }

          let couponDiscount =
            coupon.type === "PERCENTAGE"
              ? couponBase.mul(coupon.value).div(100)
              : coupon.value;
          // *** باج كان موجود: نسبة مئوية على subtotal ممكن تطلع رقم فيه
          // 3 خانات عشرية أو أكتر (10% من 1234.56 = 123.456 بالظبط) —
          // جنيه مصري معندوش غير خانتين عشريين (قرش)، فالقيمة دي كانت
          // بتتخزن زي ما هي في discount/total، وبعدين Paymob بتاخد
          // Math.round(total*100) قرش بينما الأوردر عندنا فاضل فيه رقم
          // مش حقيقي كعملة. بنقرّب هنا لأقرب قرش (خانتين عشريين) قبل أي
          // استخدام تاني للقيمة — subtotal وshippingCost أصلًا نضيفين
          // (مش فيهم قسمة)، فمجرد تقريب discount هنا كفاية عشان total
          // يطلع نضيف بردو.
          couponDiscount = couponDiscount.toDecimalPlaces(2);
          if (coupon.maxDiscount && couponDiscount.gt(coupon.maxDiscount)) couponDiscount = coupon.maxDiscount;
          if (couponDiscount.gt(couponBase)) couponDiscount = couponBase;
          // Multiple promotions must never make the merchandise total negative.
          const remainingSubtotal = subtotal.sub(discount);
          if (couponDiscount.gt(remainingSubtotal)) couponDiscount = remainingSubtotal;
          discount = discount.add(couponDiscount);
          couponId = coupon.id;
        }

        let loyaltyDiscount = new Prisma.Decimal(0);
        if (loyaltyPointsToRedeem > 0) {
          loyaltyDiscount = new Prisma.Decimal(loyaltyPointsToRedeem);
          const maxRedeemable = subtotal.sub(discount);
          if (loyaltyDiscount.gt(maxRedeemable)) throw new CheckoutError("INVALID_LOYALTY", "Too many loyalty points for this order");
          await changeLoyaltyPoints(tx, { userId, points: -loyaltyPointsToRedeem, type: "REDEEM", referenceType: "CHECKOUT", referenceId: checkoutKey, note: "Redeemed at checkout" });
          discount = discount.add(loyaltyDiscount);
        }

        // ---------- 3. الشحن (Bosta هي شركة الشحن الوحيدة/الافتراضية) + الإجمالي ----------
        // Bosta مفهاش endpoint عام بيحسب سعر الشحن لحظيًا (سعرها عبارة عن
        // كارت أسعار ثابت متفاوض عليه لكل محافظة وقت التسجيل معاهم، مش
        // API بتترجعه لكل شحنة) — فبنستخدم جدول أسعار عندنا (ShippingRate)
        // مربوط بـ cityId حقيقي عند Bosta، الأدمن بيملاه من /admin/shipping-rates.
        // القراءة دي جوه نفس الـ transaction (tx مش prisma العام) عشان
        // تفضل متسقة مع باقي الأوردر ومتضربش بتعديل الأدمن للسعر في نفس اللحظة.
        const shippingRate = await tx.shippingRate.findUnique({
          where: { bostaCityId: shippingBostaCityId },
        });
        const baseShippingFee =
          shippingRate && shippingRate.isActive
            ? shippingRate.fee
            : DEFAULT_SHIPPING_FEE;
        const { shippingCost } = computeShippingCost(baseShippingFee, subtotal);
        const total = subtotal.sub(discount).add(shippingCost);

        // ---------- 4. إنشاء الأوردر + العناصر + الدفع سوا ----------
        const createdOrder = await tx.order.create({
          data: {
            userId,
            status: "PENDING",
            paymentStatus: "PENDING",
            subtotal,
            shippingCost,
            discount,
            total,
            couponId,
            checkoutKey: checkoutKey ?? null,
            customerNote: customerNote || null,
            loyaltyPointsRedeemed: loyaltyPointsToRedeem,
            shippingFirstName: address.firstName,
            shippingLastName: address.lastName,
            shippingPhone: address.phone,
            shippingCountry: address.country,
            shippingGovernorate: address.governorate,
            shippingCity: address.city,
            shippingArea: address.area,
            // الـ id الحقيقي عند Bosta، متخزّن كـ snapshot هنا عشان خطوة
            // "Ship with Bosta" بعدين تستخدمه على طول من غير ما تعيد تحله
            // بالاسم تاني (نفس مبدأ resolveBostaCityIdCached فوق بالظبط)
            shippingBostaCityId: shippingBostaCityId,
            shippingBostaDistrictId,
            shippingStreet: address.street,
            shippingBuildingNo: address.buildingNo,
            shippingApartment: address.apartment,
            shippingPostalCode: address.postalCode,
            items: { create: orderItemsData },
            payment: { create: { method: paymentMethod, status: "PENDING", amount: total } },
            events: { create: { status: "PENDING", title: "Order placed", description: "Your order was created successfully." } },
          },
          select: {
            id: true,
            total: true,
            subtotal: true,
            discount: true,
            status: true,
            createdAt: true,
          },
        });

        for (const movement of inventorySnapshots) {
          await tx.inventoryMovement.create({ data: { variantId: movement.variantId, type: "SALE", quantityDelta: -movement.quantity, stockAfter: movement.stockAfter, referenceType: "ORDER", referenceId: createdOrder.id, note: "Checkout stock reservation" } });
        }
        await createNotification(tx, { userId, type: "ORDER", title: "Order placed", message: `Order ${createdOrder.id} was created.`, link: `/orders/${createdOrder.id}` });

        // ---------- 5. تفريغ الكارت ----------
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

        return { order: createdOrder, existing: false };
      },
      { timeout: 10000 }, // كارت فيه عناصر كتير = loop طويل، بنوسع الوقت الافتراضي (5 ثواني)
    );
    const { order, existing } = checkoutResult;
    if (existing) return NextResponse.json({ data: order, checkoutUrl: null, idempotent: true }, { status: 200 });

    // COD مالهاش دفع إلكتروني — الأوردر بس كفاية. الكارت/المحفظة محتاجين
    // نبدأ عملية دفع حقيقية عند Paymob. ده *برّه* الـ transaction اللي
    // فوق عمدًا (نفس مبدأ Bosta بالظبط): نداء شبكة خارجي بطيء/ممكن يفشل
    // مالوش داعي يمسك قفل/connection على الداتابيز، والـ transaction
    // أصلاً خلصت (commit) قبل ما نوصل هنا، فمفيش خطر إننا نرجعها.
    let checkoutUrl: string | null = null;
    let paymentError: string | undefined;

    if (paymentMethod !== "CASH_ON_DELIVERY") {
      const integrationId =
        paymentMethod === "CARD"
          ? process.env.PAYMOB_INTEGRATION_ID_CARD
          : process.env.PAYMOB_INTEGRATION_ID_WALLET;

      if (!integrationId) {
        paymentError = `Payment method ${paymentMethod} is not configured yet`;
      } else {
        try {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
          });
          const origin = getAppOrigin(request);

          const { clientSecret } = await createIntention({
            amountCents: Math.round(order.total.toNumber() * 100),
            specialReference: order.id,
            integrationId: Number(integrationId),
            billing: {
              firstName: address.firstName,
              lastName: address.lastName,
              email: user?.email ?? "customer@techstore.com",
              phone: address.phone,
              street: address.street,
              building: address.buildingNo ?? undefined,
              apartment: address.apartment ?? undefined,
              city: address.city,
            },
            notes: `Tech Store order ${order.id}`,
            notificationUrl: `${origin}/api/webhooks/paymob`,
            redirectionUrl: `${origin}/orders/${order.id}`,
          });

          checkoutUrl = paymobCheckoutUrl(clientSecret);
        } catch (err) {
          // الأوردر اتعمل فعلاً (PENDING) حتى لو فشل بدء الدفع — العميل
          // يقدر يعيد المحاولة بعدين من صفحة الأوردر (زرار Complete Payment)
          paymentError =
            err instanceof PaymobApiError || err instanceof Error
              ? err.message
              : "Could not start payment";
        }
      }
    }

    return NextResponse.json(
      { data: order, checkoutUrl, paymentError },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof CheckoutError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    throw err;
  }
}
