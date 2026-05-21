/**
 * Server-only API helpers. Imported from Server Components and route handlers.
 * Do not import from "use client" files — that pulls server config into the bundle.
 *
 * URL resolution order:
 *   1. API_URL_INTERNAL — for prod where the Next.js server reaches the API on a
 *      private hostname (e.g. http://api:8000 in docker-compose). Not exposed to browser.
 *   2. NEXT_PUBLIC_API_URL — same URL the browser uses. Works in dev and most prods.
 *   3. http://localhost:8000 — local dev fallback.
 */
import { transformSalon, type Salon } from "@/lib/api"

function getServerApiBaseUrl(): string {
  return (
    process.env.API_URL_INTERNAL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000"
  )
}

// Hard timeout for SSR fetches. Render Free sleeps after 15 min idle and a
// cold wake-up takes 30-60s — without an abort signal Next would block the
// home page render that long. 8s is enough for a warm backend but fails fast
// to the empty-state fallback when cold. Client-side queries can still
// trigger a real fetch on hydration once the user is interacting.
const SSR_FETCH_TIMEOUT_MS = 8000

export async function getSalonsServer(revalidateSeconds = 60): Promise<Salon[]> {
  const url = `${getServerApiBaseUrl()}/salons/`
  try {
    const res = await fetch(url, {
      next: { revalidate: revalidateSeconds },
      signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error(`[api-server] /salons/ ${res.status} ${res.statusText}`)
      return []
    }
    const data = await res.json()
    return data.map(transformSalon)
  } catch (err) {
    // Don't crash the page if the API is unreachable during build/SSR — return [] and
    // let the client see an empty list instead of an error boundary on first paint.
    // Covers AbortError (timeout), network failure, and unreachable backend.
    console.error("[api-server] /salons/ fetch failed:", err)
    return []
  }
}
