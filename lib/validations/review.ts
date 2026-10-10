import { z } from "zod";

export const createReviewSchema = z.object({
  orderItemId: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const updateReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
});
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
