import { z } from "zod";

export const optionCreateSchema = z.object({
  nameEn: z.string().min(1).max(100),
  nameAr: z.string().min(1).max(100),
});
export type OptionCreateInput = z.infer<typeof optionCreateSchema>;

export const optionUpdateSchema = optionCreateSchema.partial();
export type OptionUpdateInput = z.infer<typeof optionUpdateSchema>;

export const optionValueCreateSchema = z.object({
  valueEn: z.string().min(1).max(100),
  valueAr: z.string().min(1).max(100),
});
export type OptionValueCreateInput = z.infer<typeof optionValueCreateSchema>;

export const optionValueUpdateSchema = optionValueCreateSchema.partial();
export type OptionValueUpdateInput = z.infer<typeof optionValueUpdateSchema>;
