const DAY_MS = 86_400_000;

export function todayISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toUTC(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, n: number): string {
  return new Date(toUTC(iso) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Lunes de la semana que contiene la fecha. */
export function mondayOf(iso: string): string {
  const dow = new Date(toUTC(iso)).getUTCDay(); // 0 = domingo
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(iso, offset);
}

export function isValidISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUTC(s));
}

export function weekDays(weekStart: string, days = 7): string[] {
  return Array.from({ length: days }, (_, i) => addDays(weekStart, i));
}

const dayFmt = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const shortFmt = new Intl.DateTimeFormat("es-ES", {
  weekday: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDay(iso: string): string {
  return dayFmt.format(new Date(toUTC(iso)));
}

export function formatDayShort(iso: string): string {
  return shortFmt.format(new Date(toUTC(iso)));
}
