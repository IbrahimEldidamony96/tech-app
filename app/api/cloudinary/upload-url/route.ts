import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/require-permission";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { uploadFromUrl, CloudinaryError } from "@/lib/cloudinary";
import { parseUploadArea, validateRemoteImageUrl } from "@/lib/cloudinary-upload-policy";

// URL imports consume server-side Cloudinary quota and may fetch arbitrary
// remote content. Only catalog managers can use them; avatars are local
// file-only. The provider fetches the URL, not our Vercel server.
export async function POST(request: NextRequest) {
  const guard = await requirePermission("catalog:write");
  if (guard.error) return guard.error;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "url" && key !== "folder")) {
    return NextResponse.json({ error: "Unexpected upload parameters" }, { status: 400 });
  }
  const record = body as { url?: unknown; folder?: unknown };
  const area = parseUploadArea(record.folder);
  if (area !== "products" && area !== "sliders") {
    return NextResponse.json({ error: "URL import is restricted to catalog images" }, { status: 403 });
  }
  const url = validateRemoteImageUrl(record.url);
  if (!url) return NextResponse.json({ error: "Only public HTTPS image URLs are allowed" }, { status: 400 });

  const limit = await rateLimit(`cloudinary:url:${guard.user!.id}`, 20, 60 * 60 * 1000);
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const storedUrl = await uploadFromUrl(url, area, guard.user!.id);
    return NextResponse.json({ data: { url: storedUrl } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof CloudinaryError ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
