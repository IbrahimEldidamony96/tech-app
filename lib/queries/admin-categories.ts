import { prisma } from "@/lib/prisma";

export async function getAllCategoriesForAdmin() {
  return prisma.category.findMany({
    orderBy: { nameEn: "asc" },
    select: {
      id: true,
      nameEn: true,
      nameAr: true,
      slug: true,
      parentId: true,
      parent: { select: { nameEn: true, nameAr: true } },
      // العدّاد ده بيوضح فورًا ليه الحذف ممكن يترفض (قرار Restrict من Phase 0)
      _count: { select: { products: true, children: true } },
    },
  });
}
