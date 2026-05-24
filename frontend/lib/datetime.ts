const FALLBACK_TZ = "UTC"

function safeTz(tz: string | null | undefined): string {
  if (!tz) return FALLBACK_TZ
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return tz
  } catch {
    return FALLBACK_TZ
  }
}

export function toUtcIsoFromSalonLocal(
  date: string,
  time: string,
  salonTz: string | null | undefined,
): string {
  const tz = safeTz(salonTz)
  const guessUtcMs = Date.parse(`${date}T${time}:00Z`)
  if (Number.isNaN(guessUtcMs)) {
    throw new Error(`Invalid date/time: ${date} ${time}`)
  }
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
    // Intl emits "24" for midnight in some locales
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
  const offsetMs = partsAt(guessUtcMs) - guessUtcMs
  const trueUtcMs = guessUtcMs - offsetMs
  return new Date(trueUtcMs).toISOString()
}

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

export function salonLocalDateKey(salonTz: string | null | undefined, date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTz(salonTz),
    year: "numeric", month: "2-digit", day: "2-digit",
  })
  return fmt.format(date)
}

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
