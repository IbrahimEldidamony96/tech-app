import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Edge middleware still uses the JWT role for fast coarse filtering, but every
// sensitive server route re-checks the database here. This means demoting or
// soft-deleting an admin takes effect immediately instead of waiting for the
// JWT to expire.
export async function requireAdmin() {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const admin = await prisma.user.findFirst({
    where: {
      id: session.user.id,
      role: "ADMIN",
      deletedAt: null,
    },
    select: { id: true, role: true },
  });

  if (!admin) {
    return {
      session: null,
      error: NextResponse.json(
        { error: "Forbidden — admin only" },
        { status: 403 },
      ),
    };
  }

  return { session, error: null };
}
