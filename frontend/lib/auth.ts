import type { QueryClient } from "@tanstack/react-query"

const AUTH_KEYS = ["token", "user", "pending_salon", "pending_email"]

export function signOut(queryClient?: QueryClient): void {
  try {
    queryClient?.clear()
  } catch {
    // best-effort
  }
  if (typeof window !== "undefined") {
    AUTH_KEYS.forEach(k => {
      try { window.localStorage.removeItem(k) } catch { /* private mode */ }
    })
    window.location.href = "/login"
  }
}
