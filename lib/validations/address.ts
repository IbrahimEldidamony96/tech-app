import { z } from "zod";

export const addressSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(5).max(30),
  country: z.string().min(1).max(100),
  governorate: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  area: z.string().max(100).optional(),
  // الـ id الحقيقي عند Bosta لكل من المحافظة/المنطقة، جاي جاهز من الـ
  // dropdown اللي بيتغذّى من /api/bosta/cities و /api/bosta/zones — اختياري
  // عشان أي client قديم أو تعديل يدوي لسه يشتغل من غيره (هيرجع يتحل بالاسم
  // وقت الشحن/حساب سعر الشحن بدل ما يتقفل تمامًا)
  bostaCityId: z.string().max(100).optional(),
  bostaDistrictId: z.string().max(100).optional(),
  street: z.string().min(1).max(200),
  buildingNo: z.string().max(50).optional(),
  apartment: z.string().max(50).optional(),
  postalCode: z.string().max(20).optional(),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;
