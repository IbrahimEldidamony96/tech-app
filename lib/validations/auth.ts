import { z } from "zod";

// *** باج كان موجود: الإيميل كان بيتقارن زي ما هو من غير أي توحيد —
// Ahmed@x.com وahmed@x.com كانوا بيتعاملوا كحسابين مختلفين تمامًا
// (التسجيل، تسجيل الدخول، وقيد الـ unique في الداتابيز كلهم حساسين
// لحالة الأحرف). توحيد الإيميل لحروف صغيرة + إزالة المسافات هنا، في
// نقطة واحدة يشترك فيها التسجيل وتسجيل الدخول، يمنع تكرار الحساب
// ويخلي الدخول يشتغل بغض النظر عن حالة الأحرف اللي كتبها المستخدم.
const normalizedEmail = z
  .string()
  .email()
  .toLowerCase()
  .trim();

export const loginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: normalizedEmail,
  referralCode: z.string().trim().min(4).max(32).optional(),
  password: z
    .string()
    .min(8, "الباسورد لازم يكون 8 حروف على الأقل")
    .regex(/[A-Z]/, "لازم يحتوي على حرف كبير واحد على الأقل")
    .regex(/[0-9]/, "لازم يحتوي على رقم واحد على الأقل"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

// نفس شرط قوة الباسورد المستخدم في التسجيل — مستخرج هنا عشان reset
// password يستخدم نفس القاعدة بالظبط من غير ما يتكرر
const strongPassword = z
  .string()
  .min(8, "الباسورد لازم يكون 8 حروف على الأقل")
  .regex(/[A-Z]/, "لازم يحتوي على حرف كبير واحد على الأقل")
  .regex(/[0-9]/, "لازم يحتوي على رقم واحد على الأقل");

export const forgotPasswordSchema = z.object({
  email: normalizedEmail,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: strongPassword,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
