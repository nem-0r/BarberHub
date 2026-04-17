"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import { Navbar } from "@/components/barberhub/navbar"
import { Mail, ArrowRight, CheckCircle2, Loader2, Scissors } from "lucide-react"
import Link from "next/link"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("loading")
    setError("")

    try {
      await api.forgotPassword(email)
      setStatus("success")
    } catch (err: any) {
      setStatus("error")
      setError(err.message || "Failed to send reset link. Please try again.")
    }
  }

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

          <div className="bento-card">
            {status === "success" ? (
              <div className="text-center p-4">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h1 className="text-2xl font-bold mb-2">Check your email</h1>
                <p className="text-muted-foreground mb-8">
                  If an account exists for {email}, we've sent instructions to reset your password.
                </p>
                <Link
                  href="/login"
                  className="w-full py-3 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-all flex items-center justify-center gap-2"
                >
                  Return to Sign In
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold mb-2">Forgot Password?</h1>
                <p className="text-muted-foreground mb-8 text-sm">
                  No worries! Enter your email address and we'll send you a link to reset your password.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="john@example.com"
                        className="w-full pl-12 pr-4 py-3 bg-surface-elevated border border-border-solid rounded-xl focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                        required
                      />
                    </div>
                  </div>

                  {status === "error" && (
                    <p className="text-sm text-red-500 font-medium">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={status === "loading" || !email}
                    className="w-full py-3 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-all brand-glow flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {status === "loading" ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Send Reset Link
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-8 text-center pt-6 border-t border-border-solid">
                  <Link href="/login" className="text-sm text-muted-foreground hover:text-brand transition-colors">
                    Back to Sign In
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
