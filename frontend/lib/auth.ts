/**
 * Auth helpers — central place so logout, redirect and cache-reset behavior
 * stays consistent across every "Sign Out" button in the app.
 */
import type { QueryClient } from "@tanstack/react-query"

/** localStorage keys that hold auth/onboarding state. */
const AUTH_KEYS = ["token", "user", "pending_salon", "pending_email"]

/**
 * Sign the current user out.
 *
 * Production behavior (matches Slack/GitHub/Notion):
 *  1. Clear React Query cache — otherwise the next user briefly sees the
 *     previous user's `/users/me`, bookings, salon, etc. before refetching.
 *  2. Wipe persisted auth state from localStorage.
 *  3. Hard-navigate to /login via `window.location.href`. We deliberately do
 *     NOT use `router.replace` here: soft navigation keeps the SPA mounted,
 *     so any module-level singleton, in-flight fetch, websocket, or memo'd
 *     state from the previous session can leak into the login screen. A full
 *     reload is the only thing that guarantees a clean slate.
 *
 * Pass `queryClient` whenever you have one in scope. The function is safe to
 * call without it (e.g. from a navbar that doesn't import the QueryClient
 * provider).
 */
export function signOut(queryClient?: QueryClient): void {
  try {
    queryClient?.clear()
  } catch {
    // best-effort — never let a cache-reset failure block the logout itself
  }
  if (typeof window !== "undefined") {
    AUTH_KEYS.forEach(k => {
      try { window.localStorage.removeItem(k) } catch { /* private mode etc. */ }
    })
    window.location.href = "/login"
  }
}
