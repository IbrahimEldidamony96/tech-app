import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { updateReviewSchema } from "@/lib/validations/review";
import { syncProductRating } from "@/lib/product-maintenance";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const review = await prisma.review.findUnique({ where: { id }, select: { id: true, userId: true, productId: true } });
  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }
  // تعديل: صاحب الريفيو بس — حتى الأدمن مايعدلش كلام حد، يقدر يمسحه بس
  if (review.userId !== session!.user.id) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const updated = await prisma.review.update({
    where: { id },
    data: parsed.data,
    select: { id: true, rating: true, comment: true, updatedAt: true },
  });

  await syncProductRating(review.productId);
  return NextResponse.json({ data: updated });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { session, error } = await requireUser();
  if (error) return error;

  const { id } = await params;

  const review = await prisma.review.findUnique({ where: { id }, select: { id: true, userId: true, productId: true } });
  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }
  // حذف: صاحب الريفيو أو الأدمن (moderation — منتج فيه كلام مسيء مثلاً)
  if (review.userId !== session!.user.id && session!.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  await prisma.review.delete({ where: { id } });
  await syncProductRating(review.productId);

  return NextResponse.json({ data: { id, deleted: true } });
}
