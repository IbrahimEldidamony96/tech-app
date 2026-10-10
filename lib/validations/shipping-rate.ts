import { z } from "zod";

// الأدمن بيختار المحافظة من قايمة Bosta الحقيقية (مش بيكتب اسم حر)، فبنستقبل
// الـ bostaCityId + الاسم (snapshot وقت الحفظ) جاهزين من الفرونت إند بدل ما
// نعيد نداء Bosta تاني هنا.
export const shippingRateUpsertSchema = z.object({
  bostaCityId: z.string().min(1),
  cityNameEn: z.string().min(1).max(150),
  cityNameAr: z.string().max(150).optional(),
  fee: z.coerce.number().min(0).max(100000),
  isActive: z.boolean().default(true),
});
export type ShippingRateUpsertInput = z.infer<typeof shippingRateUpsertSchema>;

export const shippingRateUpdateSchema = z.object({
  fee: z.coerce.number().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
});
export type ShippingRateUpdateInput = z.infer<typeof shippingRateUpdateSchema>;
