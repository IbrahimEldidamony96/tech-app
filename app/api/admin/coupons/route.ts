import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { couponCreateSchema } from "@/lib/validations/coupon";
import { Prisma } from "@/app/generated/prisma/client";

// عكس /api/brands، الليستة هنا محمية بالكامل — أكواد الكوبونات معلومة
// حساسة، مش زي أسماء البراندات اللي المتجر نفسه بيعرضها للكل
export async function GET() {
  const { error } = await requirePermission("marketing:write");
  if (error) return error;

  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ data: coupons });
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission("marketing:write");
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = couponCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const coupon = await prisma.coupon.create({
      data: {
        ...parsed.data,
        // الحقول دي بس اللي فعلاً محتاجة default صريح وقت الإنشاء —
        // كل حاجة تانية Prisma بيتكفل بيها من الـ schema (usedCount=0، إلخ)
        usageLimitPerUser: parsed.data.usageLimitPerUser ?? 1,
        isActive: parsed.data.isActive ?? true,
      },
    });
    return NextResponse.json({ data: coupon }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Coupon code already exists" }, { status: 409 });
    }
    throw err;
  }
}
