import { z } from "zod";

export const categoryCreateSchema = z.object({
  nameEn: z.string().min(1).max(100),
  nameAr: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "slug: حروف إنجليزية صغيرة وأرقام وشرطات فقط"),
  parentId: z.string().min(1).optional(),
});

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

export const categoryUpdateSchema = categoryCreateSchema.partial();
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
