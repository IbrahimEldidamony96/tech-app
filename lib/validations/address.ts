import { z } from "zod";
const optionalText = (max: number) => z.string().max(max).nullish().transform(value => value?.trim() || null);
export const addressSchema = z.object({
  firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(5).max(30), country: z.string().trim().min(1).max(100),
  governorate: z.string().trim().min(1).max(100), city: z.string().trim().min(1).max(100),
  area: optionalText(100), bostaCityId: optionalText(100), bostaDistrictId: optionalText(100),
  street: z.string().trim().min(1).max(200), buildingNo: optionalText(50), apartment: optionalText(50), postalCode: optionalText(20),
  isDefault: z.boolean().default(false),
}).refine(value => !!value.bostaCityId === !!value.bostaDistrictId, { path: ["bostaDistrictId"], message: "Select both the carrier city and district" });
export type AddressInput = z.infer<typeof addressSchema>;
