import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { getOrCreateWishlist } from "@/lib/wishlist";

export async function GET() {
  const { session, error } = await requireUser();
  if (error) return error;

  const wishlist = await getOrCreateWishlist(session!.user.id);

  const items = await prisma.wishlistItem.findMany({
    where: { wishlistId: wishlist.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      product: {
        select: {
          id: true,
          nameEn: true,
          nameAr: true,
          slug: true,
          isActive: true,
          images: { where: { isPrimary: true }, take: 1, select: { url: true } },
          variants: {
            where: { isActive: true },
            orderBy: { price: "asc" },
            take: 1,
            select: { price: true, stock: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ data: items });
}
