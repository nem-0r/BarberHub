import { Loader2 } from "lucide-react"

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Загрузка...</p>
    </div>
  )
}
