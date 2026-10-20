import crypto from "crypto";
import { signedImageUploadParams, validateRemoteImageUrl, type UploadArea } from "@/lib/cloudinary-upload-policy";

// Cloudinary — الرفع من ملف محلي بيحصل *مباشرة من المتصفح* لـ Cloudinary
// (احنا بس بنولّد توقيع)، مش عن طريق السيرفر بتاعنا. ده مهم على Vercel
// تحديدًا: الـ serverless functions عندها حد أقصى لحجم الـ request body
// (~4.5MB افتراضيًا)، فأي صورة أكبر من كده هتفشل لو عدّيناها من عندنا.
// الرفع من رابط (URL) مختلف: الحمولة مجرد نص قصير، فده بيعدي من
// السيرفر عادي من غير مشكلة.

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

export class CloudinaryError extends Error {}

/**
 * توقيع SHA-1 لباراميترات الرفع — مطلوب من Cloudinary لأي رفع signed.
 * بيتحسب من كل الباراميترات (غير api_key والملف نفسه) مرتبة أبجديًا،
 * متسلسلة key=value&key=value، وبعدين الـ API secret في الآخر.
 */
export function createUploadSignature(
  params: Record<string, string | number>,
): string {
  if (!API_SECRET)
    throw new CloudinaryError("CLOUDINARY_API_SECRET is not set");

  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(sorted + API_SECRET)
    .digest("hex");
}

export function getCloudinaryPublicConfig(): {
  cloudName: string;
  apiKey: string;
} {
  if (!CLOUD_NAME || !API_KEY)
    throw new CloudinaryError("Cloudinary env vars are not set");
  return { cloudName: CLOUD_NAME, apiKey: API_KEY };
}

/** رفع من رابط جاهز (مش ملف من جهاز اليوزر) — بيحصل من عندنا في السيرفر. */
export async function uploadFromUrl(
  url: string,
  area: Exclude<UploadArea, "avatars">,
  userId: string,
): Promise<string> {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new CloudinaryError("Cloudinary env vars are not set");
  }

  const remoteUrl = validateRemoteImageUrl(url);
  if (!remoteUrl) throw new CloudinaryError("Only public HTTPS image URLs are allowed");

  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `u_${crypto.randomBytes(16).toString("hex")}`;
  const params = signedImageUploadParams(area, userId, publicId, timestamp);
  const signature = createUploadSignature(params);

  const form = new FormData();
  form.append("file", remoteUrl);
  form.append("api_key", API_KEY);
  form.append("signature", signature);
  for (const [key, value] of Object.entries(params)) {
    form.append(key, String(value));
  }

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: "POST", body: form, signal: AbortSignal.timeout(15_000), cache: "no-store" },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new CloudinaryError(json?.error?.message ?? "Cloudinary image upload failed");
  }
  // Never return/record a remote URL that Cloudinary did not serve.
  const secureUrl = json?.secure_url;
  if (typeof secureUrl !== "string" ||
      !secureUrl.startsWith(`https://res.cloudinary.com/${CLOUD_NAME}/image/upload/`)) {
    throw new CloudinaryError("Cloudinary returned an invalid asset URL");
  }
  return secureUrl;
}
