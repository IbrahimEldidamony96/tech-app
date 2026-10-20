import type { DefaultSession } from "next-auth";

type AppRole =
  | "CUSTOMER"
  | "SUPPORT"
  | "PRODUCT_MANAGER"
  | "ORDER_MANAGER"
  | "ADMIN"
  | "SUPER_ADMIN";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AppRole;
      // Read-only claims created by the server at the latest real sign-in.
      authenticatedAt?: number;
      authProvider?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: AppRole;
    // Optional so a pre-migration JWT fails closed at runtime.
    sessionVersion?: number;
    authenticatedAt?: number;
    authProvider?: string | null;
  }
}
