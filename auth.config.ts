import type { NextAuthConfig } from "next-auth";
import { sanitizeSessionAuthClaims } from "@/lib/session-policy";

// ⚠️ الملف ده لازم يفضل edge-safe (بيتحمّل في middleware.ts اللي شغال على
// Edge runtime، مش Node). عشان كده: من غير providers فيها DB queries
// (زي Credentials)، ومن غير PrismaAdapter (بيعتمد على "pg" اللي مش
// متوافق مع Edge). الـ providers الحقيقية والـ adapter موجودين في auth.ts.

export default {
  pages: {
    signIn: "/login",
  },
  // Edge-safe JWT parsing remains here. The Node.js auth.ts callbacks
  // revalidate every JWT against User.sessionVersion / deletedAt / current
  // role in Postgres before protected pages or APIs can access private data.
  // Edge proxy remains a fast first-pass ONLY, never the final auth guard.
  // Sessions issued before the migration deliberately require fresh login.
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
        const claims = sanitizeSessionAuthClaims(
          token.authenticatedAt,
          token.authProvider,
        );
        session.user.authenticatedAt = claims.authenticatedAt;
        session.user.authProvider = claims.authProvider;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
