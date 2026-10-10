import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categoryCreateSchema } from "@/lib/validations/category";
import { requirePermission } from "@/lib/require-permission";
import { Prisma } from "@/app/generated/prisma/client";

export async function GET() {
  // بنرجّع الكاتيجوريز الرئيسية بس، وجوه كل واحدة أولادها (level واحد كفاية
  // لواجهة القوائم المنسدلة العادية؛ لو احتجت تعمق أكتر، كرر include متداخل)
  const categories = await prisma.category.findMany({
    where: { parentId: null },
    orderBy: { nameEn: "asc" },
    select: {
      id: true,
      nameEn: true,
      nameAr: true,
      slug: true,
      children: {
        orderBy: { nameEn: "asc" },
        select: { id: true, nameEn: true, nameAr: true, slug: true },
      },
    },
  });

  return NextResponse.json({ data: categories });
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission("catalog:write");
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = categoryCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const category = await prisma.category.create({
      data: parsed.data,
      select: { id: true, nameEn: true, nameAr: true, slug: true, parentId: true },
    });
    return NextResponse.json({ data: category }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
      }
      // P2003 = FK فشلت — يعني parentId اللي اتبعت مش موجود أصلًا
      if (err.code === "P2003") {
        return NextResponse.json({ error: "parentId does not exist" }, { status: 400 });
      }
    }
    throw err;
  }
}
