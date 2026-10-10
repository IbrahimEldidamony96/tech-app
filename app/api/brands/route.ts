import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { brandCreateSchema } from "@/lib/validations/brand";
import { requirePermission } from "@/lib/require-permission";
import { Prisma } from "@/app/generated/prisma/client";

export async function GET() {
  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
  return NextResponse.json({ data: brands });
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

  const parsed = brandCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const brand = await prisma.brand.create({
      data: parsed.data,
      select: { id: true, name: true, slug: true },
    });
    return NextResponse.json({ data: brand }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    throw err;
  }
}
