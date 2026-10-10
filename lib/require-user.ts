import { NextResponse } from "next/server";
import { auth } from "@/auth";

// عكس requireAdmin — هنا أي يوزر مسجل دخول كفاية (مش شرط أدمن).
// الكارت والـ wishlist ملك لأي CUSTOMER.
export async function requireUser() {
  const session = await auth();

  if (!session?.user) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { session, error: null };
}
