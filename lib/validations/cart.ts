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
