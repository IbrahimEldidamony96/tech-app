export function referralCodeFromQuery(value: string | null): string | undefined {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z0-9]{4,32}$/.test(code) ? code : undefined;
}
