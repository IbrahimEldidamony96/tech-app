// Pure upload policy shared by the signer, URL uploader and client.
// Cloudinary accepts a signed request only when every supplied upload
// parameter matches the values included in the server-side signature.
export type UploadArea = "avatars" | "products" | "sliders";
export const IMAGE_ALLOWED_FORMATS = "jpg,jpeg,png,webp,avif";
export const IMAGE_MAX_BYTES: Record<UploadArea, number> = {
  avatars: 5 * 1024 * 1024,
  products: 10 * 1024 * 1024,
  sliders: 10 * 1024 * 1024,
};
export const SIGNATURES_PER_HOUR: Record<UploadArea, number> = {
  avatars: 10,
  products: 40,
  sliders: 20,
};

export function parseUploadArea(raw: unknown): UploadArea | null {
  return raw === "avatars" || raw === "products" || raw === "sliders" ? raw : null;
}

export function uploadFolder(area: UploadArea, userId: string): string {
  if (!/^[A-Za-z0-9_-]{5,128}$/.test(userId)) {
    throw new Error("Invalid user ID for upload scope");
  }
  return area === "avatars" ? `avatars/${userId}` : area;
}

/** id is generated on the server from crypto.randomBytes, NEVER client input. */
export function signedImageUploadParams(
  area: UploadArea,
  userId: string,
  publicId: string,
  timestamp: number,
): Record<string, string | number> {
  if (!/^u_[a-f0-9]{32}$/.test(publicId)) throw new Error("Invalid generated public ID");
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) throw new Error("Invalid timestamp");
  return {
    allowed_formats: IMAGE_ALLOWED_FORMATS,
    folder: uploadFolder(area, userId),
    overwrite: "false",
    public_id: publicId,
    timestamp,
  };
}

export function validateRemoteImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.port || url.hash) return null;
  const host = url.hostname.toLowerCase();
  // URL fetch is offered only to authorized catalog managers. Cloudinary is
  // the fetching service, but avoid obvious private/local/special targets.
  if (host.length > 253 || host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".internal") || host.endsWith(".local") ||
      host.endsWith(".test") || host.endsWith(".invalid") ||
      host.endsWith(".example") || host.includes(":") ||
      /^\d+(?:\.\d+){0,3}$/.test(host) ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host)) return null;
  return url.toString();
}
