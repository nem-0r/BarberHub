"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
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
