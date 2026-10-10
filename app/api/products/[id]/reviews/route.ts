import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProductReviews } from "@/lib/queries/reviews";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { id: productId } = await params;

  const parsed = listQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await getProductReviews(productId, parsed.data.page, parsed.data.limit);

  return NextResponse.json({
    data: result.items,
    summary: { average: result.average, count: result.total, breakdown: result.breakdown },
    pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
}
