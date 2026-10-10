import { z } from "zod";

export const brandCreateSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "slug: حروف إنجليزية صغيرة وأرقام وشرطات فقط"),
});

export type BrandCreateInput = z.infer<typeof brandCreateSchema>;

export const brandUpdateSchema = brandCreateSchema.partial();
export type BrandUpdateInput = z.infer<typeof brandUpdateSchema>;
