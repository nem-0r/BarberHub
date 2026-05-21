"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

/**
 * Default query options chosen for this app:
 *  - staleTime: 60s   — same-tab navigations are cache-first; background refetch
 *                       only after a minute (matches our SSR revalidate window).
 *  - gcTime: 5 min    — keep cache across short navigations away.
 *  - refetchOnWindowFocus: false — too noisy for a dashboard; opt-in per-query if needed.
 *  - retry: smart     — don't retry on auth errors (401/403) or 4xx in general.
 *                       Network/server errors get 1 retry.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount: number, error: unknown) => {
          const code = (error as any)?.code
          if (code === "UNAUTHORIZED" || code === "FORBIDDEN") return false
          const status = (error as any)?.status
          if (typeof status === "number" && status >= 400 && status < 500) return false
          return failureCount < 1
        },
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState (not module-scoped) so each browser tab gets its own client and SSR
  // doesn't share a client across requests. Standard TanStack pattern with App Router.
  const [client] = useState(makeQueryClient)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
