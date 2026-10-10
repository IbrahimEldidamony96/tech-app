import { prisma } from "@/lib/prisma";

export async function getAllBrandsForAdmin() {
  return prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, _count: { select: { products: true } } },
  });
}
