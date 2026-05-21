"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

/**
 * Root error boundary. Catches anything thrown during client rendering of
 * any segment under `app/`. Renders a friendly fallback instead of Next.js'
 * default red overlay or a blank page.
 *
 * `reset()` re-renders the segment; useful for transient network blips.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface to console in case a remote logger picks it up.
    console.error("[app/error]", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Что-то пошло не так</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Произошла непредвиденная ошибка. Попробуйте перезагрузить страницу.
        {error.digest ? (
          <span className="mt-1 block font-mono text-xs opacity-70">
            ref: {error.digest}
          </span>
        ) : null}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Попробовать снова</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/")}>
          На главную
        </Button>
      </div>
    </div>
  )
}
