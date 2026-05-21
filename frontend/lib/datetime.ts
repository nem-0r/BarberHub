/**
 * Timezone-aware helpers for booking times.
 *
 * Convention across the app:
 *  - Backend stores `Booking.start_time` as naive UTC and serializes it with a
 *    trailing `Z` (see `BookingRead._ser_dt`).
 *  - Frontend always sends booking times as **UTC ISO with Z**. The user picks
 *    a date+time in the *salon's* local timezone, which is converted here.
 *  - Display is always in the salon's IANA timezone (`Salon.timezone`).
 *    Falls back to the browser's local TZ when the salon TZ is missing/invalid.
 *
 * No external deps — uses native `Intl.DateTimeFormat` so we don't pay for
 * `date-fns-tz`.
 */

const FALLBACK_TZ = "UTC"

function safeTz(tz: string | null | undefined): string {
  if (!tz) return FALLBACK_TZ
  try {
    // Will throw RangeError on invalid IANA names — cheaper than a try/catch on
    // every format call further down.
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return tz
  } catch {
    return FALLBACK_TZ
  }
}

/**
 * Convert a salon-local "YYYY-MM-DD" + "HH:MM" pair into a UTC ISO string with
 * a `Z` suffix, suitable to send to `POST /bookings/`.
 *
 * Approach: read what the wall-clock would be in the salon TZ at a given UTC
 * instant, find the offset, then subtract it. Handles DST correctly because
 * the offset is computed for the exact target instant, not a fixed value.
 */
export function toUtcIsoFromSalonLocal(
  date: string,
  time: string,
  salonTz: string | null | undefined,
): string {
  const tz = safeTz(salonTz)
  // Step 1: pretend the local string IS UTC. This gives a "guess" instant that
  // is offset-wrong by exactly the salon's UTC offset.
  const guessUtcMs = Date.parse(`${date}T${time}:00Z`)
  if (Number.isNaN(guessUtcMs)) {
    throw new Error(`Invalid date/time: ${date} ${time}`)
  }
  // Step 2: find what the salon-local wall clock would say at that UTC instant.
  const partsAt = (ms: number) => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    })
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(ms)).map(p => [p.type, p.value]),
    ) as Record<string, string>
    // Intl can emit "24" for midnight in some locales — clamp.
    const hour = parts.hour === "24" ? "00" : parts.hour
    return Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(hour),
      Number(parts.minute),
      Number(parts.second),
    )
  }
  // Step 3: offset = (what salon thinks it is at guessUtcMs) - (the literal local instant).
  // Subtract that offset to get the true UTC instant.
  const offsetMs = partsAt(guessUtcMs) - guessUtcMs
  const trueUtcMs = guessUtcMs - offsetMs
  return new Date(trueUtcMs).toISOString()
}

/**
 * Format a UTC datetime in the salon's local timezone. Accepts a UTC ISO string
 * (with or without `Z` — naive strings are treated as UTC for backward compat
 * with any bookings created before the schema serializer fix).
 */
export function formatInSalonTz(
  utcIso: string,
  salonTz: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  locale = "en-US",
): string {
  if (!utcIso) return ""
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(utcIso) ? utcIso : `${utcIso}Z`
  const ms = Date.parse(normalized)
  if (Number.isNaN(ms)) return utcIso
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: safeTz(salonTz),
  }).format(new Date(ms))
}

export function formatTimeInSalonTz(utcIso: string, salonTz: string | null | undefined): string {
  return formatInSalonTz(utcIso, salonTz, { hour: "2-digit", minute: "2-digit", hour12: false })
}

export function formatDateInSalonTz(utcIso: string, salonTz: string | null | undefined): string {
  return formatInSalonTz(utcIso, salonTz, { year: "numeric", month: "short", day: "2-digit" })
}

/**
 * Salon-local "today" key in `YYYY-MM-DD` form, used to filter today's
 * appointments without doing per-row TZ math.
 */
export function salonLocalDateKey(salonTz: string | null | undefined, date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTz(salonTz),
    year: "numeric", month: "2-digit", day: "2-digit",
  })
  return fmt.format(date)
}

/**
 * "true" if the given UTC ISO timestamp falls on the same salon-local day as
 * `referenceDate` (defaults to now).
 */
export function isSameSalonDay(
  utcIso: string,
  salonTz: string | null | undefined,
  referenceDate = new Date(),
): boolean {
  if (!utcIso) return false
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(utcIso) ? utcIso : `${utcIso}Z`
  const ms = Date.parse(normalized)
  if (Number.isNaN(ms)) return false
  return salonLocalDateKey(salonTz, new Date(ms)) === salonLocalDateKey(salonTz, referenceDate)
}
