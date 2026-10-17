export function safeNextPath(value: string | null | undefined, fallback = "/") {
  return value && /^\/(?![\\/])/.test(value) ? value : fallback;
}
