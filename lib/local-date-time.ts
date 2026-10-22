export function localDateTime(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function saleDateUpdate(value: string, current: string | null): string | null | undefined {
  // Preserve seconds and the original DST offset when no edit was made.
  if (value === localDateTime(current)) return undefined;
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || localDateTime(date.toISOString()) !== value) {
    throw new Error("Invalid local date or time");
  }
  return date.toISOString();
}
