import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { requirePermission } from "@/lib/require-permission";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  createUploadSignature,
  getCloudinaryPublicConfig,
  CloudinaryError,
} from "@/lib/cloudinary";
import {
  parseUploadArea,
  signedImageUploadParams,
  SIGNATURES_PER_HOUR,
  IMAGE_MAX_BYTES,
} from "@/lib/cloudinary-upload-policy";

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "folder")) {
    return NextResponse.json({ error: "Unexpected upload parameters" }, { status: 400 });
  }

  const area = parseUploadArea((body as { folder?: unknown }).folder);
  if (!area) return NextResponse.json({ error: "Invalid upload folder" }, { status: 400 });

  let userId: string;
  if (area === "avatars") {
    const { session, error } = await requireUser();
    if (error) return error;
    userId = session!.user.id;
    // requireUser on main checks a signed JWT; ensure deleted accounts
    // cannot obtain valid Cloudinary upload signatures.
    const active = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    if (!active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else {
    const { user, error } = await requirePermission("catalog:write");
    if (error) return error;
    userId = user!.id;
  }

  const limit = await rateLimit(`cloudinary:sign:${userId}:${area}`, SIGNATURES_PER_HOUR[area], 60 * 60 * 1000);
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    // Random one-shot public ID + overwrite=false ensures a replay cannot
    // replace a previously uploaded image. Signed params may not be changed.
    const publicId = `u_${randomBytes(16).toString("hex")}`;
    const params = signedImageUploadParams(area, userId, publicId, timestamp);
    const signature = createUploadSignature(params);
    const { cloudName, apiKey } = getCloudinaryPublicConfig();
    return NextResponse.json({
      data: {
        cloudName, apiKey, signature, params,
        maxBytes: IMAGE_MAX_BYTES[area],
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof CloudinaryError ? err.message : "Could not prepare upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
