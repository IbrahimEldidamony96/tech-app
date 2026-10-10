import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { optionValueCreateSchema } from "@/lib/validations/option";
import { Prisma } from "@/app/generated/prisma/client";

type Params = { params: Promise<{ id: string; optionId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { error } = await requirePermission("catalog:write");
  if (error) return error;

  const { optionId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = optionValueCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const value = await prisma.productOptionValue.create({
      data: { optionId, ...parsed.data },
      select: { id: true, valueEn: true, valueAr: true },
    });
    return NextResponse.json({ data: value }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // @@unique([optionId, valueEn]) من Phase 1
      if (err.code === "P2002") {
        return NextResponse.json({ error: "This value already exists for this option" }, { status: 409 });
      }
      if (err.code === "P2003") {
        return NextResponse.json({ error: "Option not found" }, { status: 404 });
      }
    }
    throw err;
  }
}
