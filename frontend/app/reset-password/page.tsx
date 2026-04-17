"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Navbar } from "@/components/barberhub/navbar"
import { Lock, Eye, EyeOff, ArrowRight, CheckCircle2, Loader2, Scissors, AlertCircle } from "lucide-react"
import Link from "next/link"

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")

  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!token) {
      setStatus("error")
      setError("Invalid or missing reset token.")
    }
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return

    setStatus("loading")
    setError("")

    try {
      await api.resetPassword(token, password)
      setStatus("success")
    } catch (err: any) {
      setStatus("error")
      setError(err.message || "Failed to reset password. The link may have expired.")
    }
  }

  if (status === "success") {
    return (
      <div className="text-center p-4 animate-in fade-in zoom-in duration-500">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Password Reset!</h1>
        <p className="text-muted-foreground mb-8">
          Your password has been successfully updated. You can now sign in with your new password.
        </p>
        <Link
          href="/login"
          className="w-full py-3 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-all flex items-center justify-center gap-2"
        >
          Sign In Now
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    )
  }

  return (
    <div className="bento-card">
      <h1 className="text-2xl font-bold mb-2">Reset Password</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        Please enter your new password below. Make sure it's strong and unique.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            New Password
          </label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full pl-12 pr-12 py-3 bg-surface-elevated border border-border-solid rounded-xl focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {status === "error" && (
          <div className="flex items-center gap-2 text-sm text-red-500 font-medium bg-red-500/10 p-3 rounded-lg border border-red-500/20">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={status === "loading" || !password || !token}
          className="w-full py-3 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-all brand-glow flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {status === "loading" ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Update Password
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="pt-32 pb-16 px-6">
        <div className="max-w-md mx-auto">
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center">
                <Scissors className="w-5 h-5 text-brand-foreground" />
              </div>
              <span className="font-display font-bold text-xl">
                Barber<span className="text-brand">Hub</span>
              </span>
            </div>
          </div>

          <Suspense fallback={
            <div className="bento-card flex flex-col items-center py-12">
              <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
              <p className="text-muted-foreground">Loading reset form...</p>
            </div>
          }>
            <ResetPasswordContent />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
