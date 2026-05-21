import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Страница не найдена. Возможно, она была перемещена или удалена.
      </p>
      <Button asChild>
        <Link href="/">На главную</Link>
      </Button>
    </div>
  )
}
