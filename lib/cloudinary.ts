import crypto from "crypto";

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
  folder: string,
): Promise<string> {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new CloudinaryError("Cloudinary env vars are not set");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createUploadSignature({ folder, timestamp });

  const form = new FormData();
  form.append("file", url);
  form.append("api_key", API_KEY);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(10_000),
    },
  );

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new CloudinaryError(
      json?.error?.message ?? "Cloudinary upload failed",
    );
  }

  return json.secure_url as string;
}
