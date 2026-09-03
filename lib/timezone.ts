/**
 * Small America/Mexico_City helpers used by advisor pausing and daily-limit
 * calculations. No timezone library is added on purpose (see AGENTS.md
 * "NO SOBREINGENIERÍA"); the conversions below use the Intl API, which
 * already ships the IANA tz database in Node/V8, so DST-less Mexico City
 * (fixed UTC-6 since the 2022 national DST repeal) is handled correctly
 * without hardcoding an offset.
 */

export const MEXICO_CITY_TIME_ZONE = "America/Mexico_City";

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Wall-clock date parts (Y/M/D) for `date` as seen in Mexico City. */
export function mexicoCityDateKey(date: Date): string {
  const { year, month, day } = getZonedParts(date, MEXICO_CITY_TIME_ZONE);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Whether two instants fall on the same calendar day in Mexico City. */
export function isSameMexicoCityDay(a: Date, b: Date): boolean {
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return mexicoCityDateKey(a) === mexicoCityDateKey(b);
}

/**
 * Converts a Mexico City wall-clock time (Y/M/D HH:mm) to the UTC instant
 * it represents. Uses a guess-and-correct approach so it stays correct
 * even if Mexico ever reintroduces DST.
 */
export function mexicoCityWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const parts = getZonedParts(guess, MEXICO_CITY_TIME_ZONE);
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetMs = asIfUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

/** Tomorrow at the given Mexico City hour (e.g. 9:00 AM), as a UTC instant. */
export function mexicoCityTomorrowAt(hour: number, minute: number, reference: Date = new Date()): Date {
  const { year, month, day } = getZonedParts(reference, MEXICO_CITY_TIME_ZONE);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  return mexicoCityWallTimeToUtc(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    hour,
    minute
  );
}

/** Formats an instant as "04 sep, 09:00" in Mexico City time, for display. */
export function formatMexicoCityDateTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: MEXICO_CITY_TIME_ZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
