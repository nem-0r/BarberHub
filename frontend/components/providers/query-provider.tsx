"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

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
  const [client] = useState(makeQueryClient)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
