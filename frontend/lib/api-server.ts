import { transformSalon, type Salon } from "@/lib/api"

function getServerApiBaseUrl(): string {
  return (
    process.env.API_URL_INTERNAL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000"
  )
}

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
    console.error("[api-server] /salons/ fetch failed:", err)
    return []
  }
}
