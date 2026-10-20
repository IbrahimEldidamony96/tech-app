/**
 * Cash collection reporting: payments are counted when captured, refunds
 * when independently confirmed; the order's creation/status is not evidence
 * that customer money was received. Money is accumulated in integer cents.
 */
export type MoneyEvent = {
  kind: "CAPTURE" | "REFUND";
  at: Date;
  amountCents: number;
};

export function decimalEgpToCents(amount: string): number {
  const trimmed = amount.trim();
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Expected a non-negative EGP amount with <=2 decimal places");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error("Amount exceeds safe integer cents");
  return result;
}

export function aggregateCashEvents(events: readonly MoneyEvent[]) {
  const daily = new Map<string, { grossCents: number; refundedCents: number; paidOrders: number }>();
  let grossCents = 0;
  let refundedCents = 0;
  let paidOrders = 0;
  for (const e of events) {
    if (!Number.isSafeInteger(e.amountCents) || e.amountCents < 0 ||
        !Number.isFinite(e.at.getTime())) {
      throw new Error("Invalid cash event");
    }
    const key = cairoDayKey(e.at);
    const row = daily.get(key) ?? { grossCents: 0, refundedCents: 0, paidOrders: 0 };
    if (e.kind === "CAPTURE") {
      grossCents += e.amountCents;
      paidOrders++;
      row.grossCents += e.amountCents;
      row.paidOrders++;
    } else {
      refundedCents += e.amountCents;
      row.refundedCents += e.amountCents;
    }
    daily.set(key, row);
  }
  return { grossCents, refundedCents, netCents: grossCents - refundedCents,
    paidOrders, daily };
}

const CAIRO = "Africa/Cairo";

export function cairoDayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAIRO, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const val = (name: string) => parts.find(p => p.type === name)!.value;
  return `${val("year")}-${val("month")}-${val("day")}`;
}

function timeZoneOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAIRO, hourCycle: "h23", year: "numeric",
    month: "2-digit", day: "2-digit", hour: "2-digit",
    minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const num = (part: string) => Number(parts.find(p => p.type === part)!.value);
  const localAsUtc = Date.UTC(num("year"), num("month") - 1, num("day"),
    num("hour"), num("minute"), num("second"));
  return localAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** First instant of the specified Cairo calendar day, handling DST changes. */
export function cairoStartOfDay(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const localMidnightUtc = Date.UTC(y, m - 1, d);
  let utcMs = localMidnightUtc - timeZoneOffsetMs(new Date(localMidnightUtc));
  utcMs = localMidnightUtc - timeZoneOffsetMs(new Date(utcMs));
  return new Date(utcMs);
}

export function cairoRangeDayKeys(range: "today" | "7d" | "30d", now = new Date()): string[] {
  const today = cairoDayKey(now);
  const [y, m, d] = today.split("-").map(Number);
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30;
  const result: string[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    result.push(new Date(Date.UTC(y, m - 1, d - offset)).toISOString().slice(0, 10));
  }
  return result;
}

export function amountFromCents(cents: number): number {
  return cents / 100;
}
