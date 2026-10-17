import { z } from "zod";

export const addToCartSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(10),
});
export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(10),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const mergeCartSchema = z.object({
  items: z.array(addToCartSchema).min(1).max(50),
}).superRefine(({ items }, context) => {
  if (new Set(items.map((item) => item.variantId)).size !== items.length) {
    context.addIssue({
      code: "custom",
      message: "Duplicate cart variants are not allowed",
      path: ["items"],
    });
  }
});
export type MergeCartInput = z.infer<typeof mergeCartSchema>;
