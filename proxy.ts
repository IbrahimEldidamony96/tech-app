import NextAuth from "next-auth";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

export const proxy = auth;

export const config = {
  // Page navigation still gets edge redirects. API handlers authorize with
  // requirePermission() and return JSON 401/403 (never HTML login pages).
  matcher: ["/admin/:path*"],
};
