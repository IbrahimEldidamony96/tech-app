import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requirePermission } from "@/lib/require-permission";
import { uploadFromUrl, CloudinaryError } from "@/lib/cloudinary";

const ADMIN_ONLY_FOLDERS = new Set(["products", "sliders"]);

// رفع من رابط جاهز (مش ملف من جهاز اليوزر) — الحمولة هنا مجرد نص
// (الرابط)، فمفيش مشكلة حجم body زي رفع الملفات، وبيعدي من عندنا عادي.
export async function POST(request: NextRequest) {
  let body: { url?: string; folder?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const folder = ADMIN_ONLY_FOLDERS.has(body.folder ?? "")
    ? (body.folder as string)
    : "avatars";

  const { error } = ADMIN_ONLY_FOLDERS.has(folder)
    ? await requirePermission("catalog:write")
    : await requireUser();
  if (error) return error;

  if (!body.url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const url = await uploadFromUrl(body.url, folder);
    return NextResponse.json({ data: { url } });
  } catch (err) {
    const message =
      err instanceof CloudinaryError || err instanceof Error
        ? err.message
        : "Upload failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
