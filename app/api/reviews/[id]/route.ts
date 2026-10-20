import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { updateReviewSchema } from "@/lib/validations/review";
import { syncProductRating } from "@/lib/product-maintenance";
import { hasPermission } from "@/lib/permissions";

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
  // Only the owner or a CURRENT database-authorized moderator may delete.
  // JWT roles must not grant moderation after staff demotion/deletion.
  if (review.userId !== session!.user.id) {
    const actor = await prisma.user.findFirst({
      where: { id: session!.user.id, deletedAt: null },
      select: { role: true },
    });
    if (!hasPermission(actor?.role, "reviews:moderate")) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
  }

  await prisma.review.delete({ where: { id } });
  await syncProductRating(review.productId);

  return NextResponse.json({ data: { id, deleted: true } });
}
