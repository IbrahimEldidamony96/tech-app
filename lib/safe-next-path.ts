const LOCAL_ORIGIN = "https://local.invalid";

function isLocalPath(value: string) {
  let candidate = value;
  try {
    // Validate encoded forms too, while preserving the original URL for use.
    for (;;) {
      if (!candidate.startsWith("/") || candidate.startsWith("//") ||
          candidate.includes("\\") ||
          Array.from(candidate).some((char) => char.charCodeAt(0) <= 31 || char.charCodeAt(0) === 127) ||
          new URL(candidate, LOCAL_ORIGIN).origin !== LOCAL_ORIGIN) return false;
      const decoded = candidate.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      if (decoded === candidate) return true;
      candidate = decoded;
    }
  } catch {
    return false;
  }
}

export function safeNextPath(value: string | null | undefined, fallback = "/") {
  if (value && isLocalPath(value)) return value;
  return isLocalPath(fallback) ? fallback : "/";
}
