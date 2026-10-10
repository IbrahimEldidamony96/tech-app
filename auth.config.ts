import type { NextAuthConfig } from "next-auth";

// ⚠️ الملف ده لازم يفضل edge-safe (بيتحمّل في middleware.ts اللي شغال على
// Edge runtime، مش Node). عشان كده: من غير providers فيها DB queries
// (زي Credentials)، ومن غير PrismaAdapter (بيعتمد على "pg" اللي مش
// متوافق مع Edge). الـ providers الحقيقية والـ adapter موجودين في auth.ts.

export default {
  pages: {
    signIn: "/login",
  },
  // *** باج كان موجود: الـ session بتاعتنا JWT (مش database sessions)
  // عمدًا — عشان middleware (Edge) يتحقق من الجلسة من غير query للداتابيز
  // في كل request. التكلفة: أي تغيير في صلاحيات اليوزر (ترقية/تنزيل
  // لأدمن، حذف الحساب) مبيتفعلش إلا لما الـ JWT نفسه ينتهي، لأن الدور
  // متخزن جوه التوكن وقت تسجيل الدخول، مش بيتقرا من الداتابيز تاني.
  // من غير maxAge محدد، Auth.js بيستخدم 30 يوم افتراضيًا — نافذة طويلة
  // جدًا لحساب أدمن اتحذف يفضل شغال بيها.
  //
  // مفيش حل يقفل الثغرة دي تمامًا من غير ما نكسر هدف الـ Edge middleware
  // (محتاج إما database sessions كاملة، أو جدول denylist للتوكنات
  // الملغاة — الاتنين تغيير معماري أكبر محتاج نقاش منفصل). اللي ممكن
  // نعمله آمن من غير أي query إضافي على Edge: تقصير عمر الجلسة نفسها،
  // فلو حصل أي تغيير، أقصى وقت لظهور تأثيره هو مدة الـ session دي، مش
  // 30 يوم. 7 أيام اختيار متوسط — عميل عادي مش هيلاحظ فرق، وحساب أدمن
  // اتحذف بيتوقف خلال أسبوع كحد أقصى بدل شهر.
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 أيام
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;

      const isAdminArea =
        path.startsWith("/admin") || path.startsWith("/api/admin");
      if (isAdminArea) {
        return isLoggedIn && auth?.user?.role !== "CUSTOMER";
      }

      return true; // باقي الصفحات مفتوحة — أي تحقق أدق بيحصل جوه كل route لوحده
    },
    // ⚠️ نقلنا jwt/session هنا (مش سايبينهم في auth.ts بس) عشان النسخة
    // الخفيفة اللي بيستخدمها proxy.ts تشوف الـ role برضه، مش بس النسخة
    // الكاملة. من غيرها، الـ Header يقدر يشوف role الأدمن لكن proxy.ts
    // (اللي بيمنع دخول /admin) يشوفه CUSTOMER عادي — بالظبط الباج اللي حصل.
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role =
          (user as { role?: "CUSTOMER" | "SUPPORT" | "PRODUCT_MANAGER" | "ORDER_MANAGER" | "ADMIN" | "SUPER_ADMIN" }).role ?? "CUSTOMER";
      }
      // بيتفعّل لما الفرونت إند ينادي useSession().update({...}) بعد
      // تحديث البروفايل — من غيره الاسم/الصورة في الـ session هيفضلوا
      // القيم القديمة لحد ما اليوزر يعمل logout/login تاني، لأن JWT
      // strategy مالهاش داعي يرجع للداتابيز في كل request
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.image) token.picture = session.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "CUSTOMER" | "SUPPORT" | "PRODUCT_MANAGER" | "ORDER_MANAGER" | "ADMIN" | "SUPER_ADMIN";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
