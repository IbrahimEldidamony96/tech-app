import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/require-permission";
import { sliderImageCreateSchema } from "@/lib/validations/slider-image";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission("marketing:write");
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = sliderImageCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const maxSortOrder = await prisma.sliderImage.aggregate({
    _max: { sortOrder: true },
  });

  const slide = await prisma.sliderImage.create({
    data: {
      url: parsed.data.url,
      alt: parsed.data.alt,
      link: parsed.data.link || null,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json({ data: slide }, { status: 201 });
}
