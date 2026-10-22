import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { changePasswordSchema } from "@/lib/validations/profile";
import { hasRecentGoogleAuthentication } from "@/lib/session-policy";

export async function PATCH(request: NextRequest) {
  const { session, error } = await requireUser();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const userId = session!.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, sessionVersion: true, deletedAt: true },
  });
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.password !== null) {
    // Password owners must prove the current password on every change.
    if (!parsed.data.currentPassword) {
      return NextResponse.json({ error: "Current password is required" }, { status: 400 });
    }
    if (!await bcrypt.compare(parsed.data.currentPassword, user.password)) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }
  } else {
    // A stolen/old OAuth session must never create a permanent password.
    // Sign out and sign in with Google again, within five minutes.
    if (!hasRecentGoogleAuthentication(
      session!.user.authProvider,
      session!.user.authenticatedAt,
    )) {
      return NextResponse.json({
        error: "Please sign in again with Google to set your first password.",
        code: "REAUTH_REQUIRED",
      }, { status: 403 });
    }
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);

  // CAS prevents concurrent password updates using the same old credentials.
  // Session revocation is committed atomically with the new password hash.
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.user.updateMany({
      where: {
        id: userId,
        deletedAt: null,
        sessionVersion: user.sessionVersion,
        password: user.password,
      },
      data: {
        password: newHash,
        sessionVersion: { increment: 1 },
      },
    });
    if (changed.count === 1) {
      await tx.verificationToken.updateMany({
        where: { userId, type: "PASSWORD_RESET", usedAt: null },
        data: { usedAt: new Date() },
      });
    }
    return changed;
  });

  if (updated.count !== 1) {
    return NextResponse.json({
      error: "Your account changed during this request. Sign in again.",
      code: "SESSION_CHANGED",
    }, { status: 409 });
  }

  // Auth.js no longer accepts this JWT, nor any other previous session.
  return NextResponse.json({
    data: { success: true, signInRequired: true },
  }, { headers: { "Cache-Control": "no-store" } });
}
