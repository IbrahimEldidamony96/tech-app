import type { DefaultSession } from "next-auth";

// بدون الملف ده، TypeScript مش هيعرف إن session.user فيها id وrole —
// دول حقول إحنا ضفناها بنفسنا في auth.ts (jwt/session callbacks)،
// مش موجودة افتراضيًا في نوع Session بتاع NextAuth.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "CUSTOMER" | "SUPPORT" | "PRODUCT_MANAGER" | "ORDER_MANAGER" | "ADMIN" | "SUPER_ADMIN";
    sessionVersion?: number;
    authenticatedAt?: number;
    authProvider?: string | null;
      authenticatedAt?: number;
      authProvider?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "CUSTOMER" | "SUPPORT" | "PRODUCT_MANAGER" | "ORDER_MANAGER" | "ADMIN" | "SUPER_ADMIN";
  }
}
