"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Navbar } from "@/components/barberhub/navbar"
import { CheckCircle2, XCircle, Loader2, Scissors, ArrowRight } from "lucide-react"
import Link from "next/link"

function VerifyContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")
  
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("")
  const [isPartner, setIsPartner] = useState(false)

  useEffect(() => {
    if (!token) {
      setStatus("error")
      setMessage("Invalid verification link. Token is missing.")
      return
    }

    async function verify() {
      try {
        const res = await api.verifyEmail(token!)
        setStatus("success")
        setMessage(res.message || "Your email has been successfully verified!")
        // Check if this is a partner completing registration
        // Use localStorage (not sessionStorage) — email links open in a new tab
        const pending = localStorage.getItem("pending_salon")
        setIsPartner(!!pending)
      } catch (err: any) {
        setStatus("error")
        setMessage(err.message || "Something went wrong during verification.")
      }
    }

    verify()
  }, [token])

  return (
    <div className="max-w-md mx-auto">
      <div className="bento-card text-center p-12">
        {status === "loading" && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-16 h-16 text-brand animate-spin mb-6" />
            <h1 className="text-2xl font-bold text-foreground mb-2">Verifying...</h1>
            <p className="text-muted-foreground">Please wait while we confirm your email address.</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Email Verified!</h1>
            <p className="text-muted-foreground mb-2">{message}</p>
            {isPartner && (
              <p className="text-sm text-brand mb-6 font-medium">
                Sign in to complete your salon setup. Your business info was saved.
              </p>
            )}
            {!isPartner && <div className="mb-6" />}
            <Link
              href="/login"
              className="w-full py-3 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-all brand-glow flex items-center justify-center gap-2"
            >
              {isPartner ? "Sign In & Set Up Salon" : "Sign In to Your Account"}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Verification Failed</h1>
            <p className="text-muted-foreground mb-8">
              {message}
            </p>
            <div className="flex flex-col gap-3 w-full">
              <Link
                href="/auth/partner-register"
                className="w-full py-3 bg-surface-elevated text-foreground rounded-xl font-medium hover:bg-muted transition-colors border border-border-solid"
              >
                Try Registering Again
              </Link>
              <Link
                href="/"
                className="text-sm text-brand hover:underline"
              >
                Back to Home
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-32 pb-16 px-6">
        <div className="max-w-7xl mx-auto flex flex-col items-center">
          <div className="flex items-center gap-2 mb-12">
            <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center">
              <Scissors className="w-5 h-5 text-brand-foreground" />
            </div>
            <span className="font-display font-bold text-xl text-foreground">
              Barber<span className="text-brand">Hub</span>
            </span>
          </div>

          <Suspense fallback={
            <div className="flex flex-col items-center">
              <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          }>
            <VerifyContent />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
