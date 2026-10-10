import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requirePermission } from "@/lib/require-permission";
import {
  createUploadSignature,
  getCloudinaryPublicConfig,
  CloudinaryError,
} from "@/lib/cloudinary";

// بيولّد توقيع للرفع المباشر من المتصفح لـ Cloudinary (من غير ما الملف
// يعدي على السيرفر بتاعنا خالص). "products" و"sliders" فولدرات محجوزة
// للأدمن بس — أي حد تاني بيرفع في "avatars" بتاعته بس.
const ADMIN_ONLY_FOLDERS = new Set(["products", "sliders"]);

export async function POST(request: NextRequest) {
  let body: { folder?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const folder = ADMIN_ONLY_FOLDERS.has(body.folder ?? "")
    ? (body.folder as string)
    : "avatars";

  const { error } = ADMIN_ONLY_FOLDERS.has(folder)
    ? await requirePermission("catalog:write")
    : await requireUser();
  if (error) return error;

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createUploadSignature({ folder, timestamp });
    const { cloudName, apiKey } = getCloudinaryPublicConfig();

    return NextResponse.json({
      data: { timestamp, signature, cloudName, apiKey, folder },
    });
  } catch (err) {
    const message =
      err instanceof CloudinaryError ? err.message : "Could not prepare upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
