import { z } from "zod";

const saleFields = {
  salePrice: z.coerce.number().positive().nullable().optional(),
  saleStartsAt: z.coerce.date().nullable().optional(),
  saleEndsAt: z.coerce.date().nullable().optional(),
};

export const variantCreateSchema = z.object({
  sku: z.string().min(1).max(100),
  price: z.coerce.number().positive(),
  stock: z.coerce.number().int().min(0),
  optionValueIds: z.array(z.string().min(1)).optional(),
  ...saleFields,
}).superRefine((value, ctx) => {
  if (value.salePrice != null && value.salePrice >= value.price) {
    ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Sale price must be lower than the regular price" });
  }
  if (value.saleStartsAt && value.saleEndsAt && value.saleStartsAt >= value.saleEndsAt) {
    ctx.addIssue({ code: "custom", path: ["saleEndsAt"], message: "Sale end must be after sale start" });
  }
});
export type VariantCreateInput = z.infer<typeof variantCreateSchema>;

export const variantUpdateSchema = z.object({
  sku: z.string().min(1).max(100).optional(),
  price: z.coerce.number().positive().optional(),
  stock: z.coerce.number().int().min(0).optional(),
  expectedStock: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  ...saleFields,
}).superRefine((value, ctx) => {
  if (value.stock !== undefined && value.expectedStock === undefined) {
    ctx.addIssue({ code: "custom", path: ["expectedStock"], message: "Reload current stock before making a correction" });
  }
  if (value.saleStartsAt && value.saleEndsAt && value.saleStartsAt >= value.saleEndsAt) {
    ctx.addIssue({ code: "custom", path: ["saleEndsAt"], message: "Sale end must be after sale start" });
  }
});
export type VariantUpdateInput = z.infer<typeof variantUpdateSchema>;
