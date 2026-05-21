import { Loader2 } from "lucide-react"

/**
 * Root loading UI — shown while a server-rendered segment is streaming.
 * Especially important on free-tier hosts where the backend can be cold and
 * SSR may take several seconds before the first byte.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Загрузка...</p>
    </div>
  )
}
