import { z } from "zod";

export const toggleWishlistSchema = z.object({
  productId: z.string().min(1),
});
export type ToggleWishlistInput = z.infer<typeof toggleWishlistSchema>;
