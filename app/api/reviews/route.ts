import { Prisma } from "@/app/generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { createReviewSchema } from "@/lib/validations/review";
import { withProductReviewLock } from "@/lib/product-maintenance";

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

  const parsed = createReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { orderItemId, rating, comment } = parsed.data;

  // *** "شراء موثّق" = خمس شروط، كل واحد لازم يعدي ***

  // 1) الـ order item ده لازم يكون موجود، وهنجيب معاه الأوردر
  //    والمنتج المرتبط عشان باقي الفحوصات
  const orderItem = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: {
      order: { select: { userId: true, status: true } },
      variant: { select: { productId: true } },
    },
  });

  if (!orderItem) {
    return NextResponse.json({ error: "Order item not found" }, { status: 404 });
  }

  // 2) الأوردر ده لازم يكون بتاع اليوزر نفسه — IDOR check تاني
  if (orderItem.order.userId !== userId) {
    return NextResponse.json({ error: "Order item not found" }, { status: 404 });
  }

  // 3) الأوردر لازم يكون اتسلم فعلاً — "موثّق" يعني استلمت المنتج،
  //    مش بس طلبته أو دفعت فيه
  if (orderItem.order.status !== "DELIVERED") {
    return NextResponse.json(
      { error: "You can only review products from delivered orders" },
      { status: 403 }
    );
  }

  // 4) الـ orderItem ده لسه معملوش عليه ريفيو (فحص ودود قبل ما نسيب
  //    الداتابيز ترفض بـ @@unique(orderItemId) خام)
  const existingByOrderItem = await prisma.review.findUnique({ where: { orderItemId } });
  if (existingByOrderItem) {
    return NextResponse.json({ error: "You already reviewed this item" }, { status: 409 });
  }

  // 5) اليوزر مراجعش نفس المنتج ده قبل كده من أوردر تاني (@@unique([userId, productId]))
  const existingByProduct = await prisma.review.findUnique({
    where: { userId_productId: { userId, productId: orderItem.variant.productId } },
  });
  if (existingByProduct) {
    return NextResponse.json({ error: "You already reviewed this product" }, { status: 409 });
  }

  // ملحوظة: productId مش جاي من الـ body — بنشتقه من الـ orderItem
  // نفسه اللي اتأكدنا منه فوق، مش بنثق في أي productId العميل يبعته
  try {
    const review = await withProductReviewLock(orderItem.variant.productId, tx => tx.review.create({
      data: { userId, productId: orderItem.variant.productId, orderItemId, rating, comment },
      select: { id: true, rating: true, comment: true, createdAt: true },
    }));
    return NextResponse.json({ data: review }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "You already reviewed this product" }, { status: 409 });
    throw error;
  }
}
