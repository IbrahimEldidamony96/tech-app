import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  // بنقبل رابط بس دلوقتي (مفيش رفع ملفات حقيقي متظبط في المشروع لسه —
  // نفس المبدأ المستخدم مع صور المنتجات، next.config.ts فيه تعليق جاهز
  // لإضافة Cloudinary أو CDN حقيقي بعدين لو حبينا نطور لرفع فعلي)
  image: z.string().url().max(2000).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// نفس قواعد قوة الباسورد المستخدمة في التسجيل (lib/validations/auth.ts)
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).optional(), // اختياري: يوزر دخل بجوجل ومالوش باسورد قبل كده
  newPassword: z
    .string()
    .min(8, "الباسورد لازم يكون 8 حروف على الأقل")
    .regex(/[A-Z]/, "لازم يحتوي على حرف كبير واحد على الأقل")
    .regex(/[0-9]/, "لازم يحتوي على رقم واحد على الأقل"),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
