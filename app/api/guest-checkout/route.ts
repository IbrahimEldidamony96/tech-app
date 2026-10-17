import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";

// Kept as an explicit compatibility endpoint for old clients. It can no
// longer create an order: signed-out requests are rejected and signed-in
// clients must use the authenticated /api/checkout flow.
export async function POST() {
  const { error } = await requireUser();
  if (error) return error;

  return NextResponse.json(
    { error: "Guest checkout is disabled. Use authenticated checkout." },
    { status: 410 },
  );
}
