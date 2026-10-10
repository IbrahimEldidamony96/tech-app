import { z } from "zod";

// عمود واحد لكل الحقول، من غير .default() هنا خالص — الـ .partial() بتاع
// التحديث كان هيورّث أي default() موجود ويطبقها حتى لو الحقل مش مبعوت
// أصلاً في الـ PATCH (يعني تحديث isActive بس كان ممكن يصفّر usageLimitPerUser
// لـ 1 من غير قصد). الـ defaults الفعلية بتتطبق في الـ route نفسه وقت الإنشاء بس.
const couponBase = z.object({
  code: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9-]+$/, "code: letters, numbers, and dashes only")
    .transform((v) => v.toUpperCase()),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.number().positive(),
  minOrderAmount: z.number().positive().nullable().optional(),
  maxDiscount: z.number().positive().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  usageLimitPerUser: z.number().int().positive().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
  firstOrderOnly: z.boolean().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  brandId: z.string().min(1).nullable().optional(),
});

// النسبة المئوية لازم تفضل ≤100 — نفس الفحص لازم يتطبق سواء وقت الإنشاء
// أو التحديث، فمكرره كدالة بدل ما نكررها جوه refine() مرتين
function isValidPercentage(data: { type?: "PERCENTAGE" | "FIXED"; value?: number }) {
  return data.type !== "PERCENTAGE" || data.value === undefined || data.value <= 100;
}

export const couponCreateSchema = couponBase.refine(isValidPercentage, {
  message: "Percentage value must be 100 or less",
  path: ["value"],
});
export type CouponCreateInput = z.infer<typeof couponCreateSchema>;

export const couponUpdateSchema = couponBase.partial().refine(isValidPercentage, {
  message: "Percentage value must be 100 or less",
  path: ["value"],
});
export type CouponUpdateInput = z.infer<typeof couponUpdateSchema>;
