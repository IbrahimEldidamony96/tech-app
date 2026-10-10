import { prisma } from "@/lib/prisma";

// Public homepage — only active slides, in admin-configured order.
export async function getActiveSlidersForHomepage() {
  return prisma.sliderImage.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, url: true, alt: true, link: true },
  });
}

// Admin management page — everything, including disabled slides, so they
// can be re-enabled instead of having to be re-uploaded.
export async function getAllSlidersForAdmin() {
  return prisma.sliderImage.findMany({
    orderBy: { sortOrder: "asc" },
  });
}
