"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, Scissors, ArrowRight, Phone } from "lucide-react"
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google"
import { Navbar } from "@/components/barberhub/navbar"
import { api } from "@/lib/api"

const GOOGLE_OAUTH_ENABLED = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

function isSafeRedirect(url: string): boolean {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//")
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<"login" | "register">("login")
  const [showPass, setShowPass] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [resendError, setResendError] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)

  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  const handleResendVerification = async () => {
    if (!unverifiedEmail || resendStatus === "sending" || resendCooldown > 0) return
    setResendStatus("sending")
    setResendError(null)
    try {
      await api.resendVerification(unverifiedEmail)
      if (!isMounted.current) return
      setResendStatus("sent")
      setResendCooldown(60)
    } catch (err: any) {
      if (!isMounted.current) return
      setResendStatus("error")
      setResendError(err?.message || "Could not send. Try again later.")
      setResendCooldown(15)
    }
  }

  const switchTab = (next: "login" | "register") => {
    setTab(next)
    setError(null)
    setUnverifiedEmail(null)
    setResendStatus("idle")
    setResendError(null)
    // resendCooldown intentionally not reset — tracks a real backend throttle window
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      setUnverifiedEmail(null)
      setResendStatus("idle")
      setResendError(null)
      if (tab === "login") {
        const data = await api.login({ email, password })
        const token = data.access_token
        localStorage.setItem("token", token)
        
        const user = await api.getMe(token)
        localStorage.setItem("user", JSON.stringify(user))

        const redirectParam = searchParams.get("redirect") ?? ""
        const fallback = (user.role === 'owner' || user.role === 'admin')
          ? "/partner/dashboard"
          : "/profile"
        router.push(isSafeRedirect(redirectParam) ? redirectParam : fallback)
      } else {
        await api.register({
          email,
          password,
          full_name: name,
          phone: phone,
        })
        setRegisteredEmail(email)
      }
    } catch (err: any) {
      if (err.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(email)
        setError(null)
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSuccess = async (resp: CredentialResponse) => {
    if (!resp.credential) {
      setError("Google sign-in returned no credential")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await api.loginWithGoogle(resp.credential)
      const token = data.access_token
      localStorage.setItem("token", token)
      const user = await api.getMe(token)
      localStorage.setItem("user", JSON.stringify(user))
      const redirectParam = searchParams.get("redirect") ?? ""
      const fallback = (user.role === "owner" || user.role === "admin")
        ? "/partner/dashboard"
        : "/profile"
      router.push(isSafeRedirect(redirectParam) ? redirectParam : fallback)
    } catch (err: any) {
      setError(err.message || "Google sign-in failed")
    } finally {
      setLoading(false)
    }
  }

  if (registeredEmail) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-6 pt-24">
          <div className="w-full max-w-md text-center">
            <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto mb-6">
              <Scissors className="w-8 h-8 text-brand" />
            </div>
            <h1 className="font-display font-bold text-2xl text-foreground mb-2">Almost there!</h1>
            <p className="text-muted-foreground mb-1">
              We sent a confirmation link to
            </p>
            <p className="font-semibold text-foreground mb-6">{registeredEmail}</p>
            <p className="text-sm text-muted-foreground mb-8">
              Please open the email and click the link to activate your account. Then come back to sign in.
            </p>
            <button
              onClick={() => { setRegisteredEmail(null); setTab("login"); setEmail(registeredEmail) }}
              className="w-full py-3 rounded-xl bg-brand text-brand-foreground font-semibold text-sm hover:bg-brand/90 transition-all brand-glow"
            >
              Go to Sign In
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <div className="flex-1 flex items-center justify-center p-6 pt-24">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center brand-glow">
              <Scissors className="w-5 h-5 text-brand-foreground" />
            </div>
            <span className="font-display font-bold text-2xl text-foreground">
              Barber<span className="text-brand">Hub</span>
            </span>
          </div>

          <div className="glass-card p-8">
            <div className="flex p-1 rounded-xl bg-surface-elevated border border-border-solid mb-8">
              {(["login", "register"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize transition-all ${
                    tab === t
                      ? "bg-brand text-brand-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "login" ? "Sign In" : "Register"}
                </button>
              ))}
            </div>

            <h1 className="font-display font-bold text-2xl text-foreground mb-1 text-balance">
              {tab === "login" ? "Welcome back" : "Create account"}
            </h1>
            <p className="text-muted-foreground text-sm mb-6">
              {tab === "login"
                ? "Sign in to manage your appointments."
                : "Join BarberHub and book your first cut."}
            </p>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs mb-6 animate-in fade-in zoom-in duration-200">
                {error}
              </div>
            )}

            {unverifiedEmail && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm mb-6 animate-in fade-in zoom-in duration-200 space-y-3">
                <p className="font-semibold">Email not verified</p>
                <p className="text-xs text-amber-500/80">
                  We sent a confirmation link to <strong>{unverifiedEmail}</strong>. Check your inbox (and spam folder).
                </p>

                {resendStatus === "sent" && (
                  <p className="text-xs text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                    ✓ Fresh verification link sent. Give it up to a minute to arrive.
                  </p>
                )}
                {resendStatus === "error" && resendError && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">
                    {resendError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendStatus === "sending" || resendCooldown > 0}
                  className="w-full py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-amber-500 font-semibold text-xs transition-colors"
                >
                  {resendStatus === "sending"
                    ? "Sending..."
                    : resendCooldown > 0
                      ? `Resend available in ${resendCooldown}s`
                      : "Resend verification email"}
                </button>
              </div>
            )}

            {GOOGLE_OAUTH_ENABLED ? (
              <>
                <div className="flex justify-center mb-5">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError("Google sign-in failed")}
                    theme="filled_black"
                    shape="pill"
                    text={tab === "login" ? "signin_with" : "signup_with"}
                    locale="en"
                    width="320"
                  />
                </div>

                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 h-px bg-border-solid" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border-solid" />
                </div>
              </>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              {tab === "register" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full px-4 py-3 rounded-xl bg-surface-elevated border border-border-solid text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-brand transition-colors"
                      required
                      autoComplete="name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+7 777 000 00 00"
                        className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-elevated border border-border-solid text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-brand transition-colors"
                        required
                        autoComplete="tel"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 rounded-xl bg-surface-elevated border border-border-solid text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-brand transition-colors"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-foreground">Password</label>
                  {tab === "login" && (
                    <Link href="/forgot-password" title="Click to reset your password" className="text-xs text-brand hover:text-brand/80 transition-colors">
                      Forgot password?
                    </Link>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl bg-surface-elevated border border-border-solid text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-brand transition-colors pr-11"
                    required
                    autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-brand text-brand-foreground font-semibold text-sm hover:bg-brand/90 disabled:opacity-60 transition-all brand-glow mt-2"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-brand-foreground/30 border-t-brand-foreground rounded-full animate-spin" />
                ) : (
                  <>
                    {tab === "login" ? "Sign In" : "Create Account"}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {tab === "register" && (
              <div className="mt-4 space-y-4">
                <p className="text-xs text-muted-foreground text-center">
                  By registering you agree to our{" "}
                  <a href="#" className="text-brand hover:underline">Terms</a> &{" "}
                  <a href="#" className="text-brand hover:underline">Privacy Policy</a>.
                </p>
                
                <div className="pt-4 border-t border-border-solid">
                  <p className="text-sm text-center font-medium text-foreground mb-2">Are you a Salon Owner?</p>
                  <Link 
                    href="/auth/partner-register" 
                    className="w-full py-2.5 rounded-xl border border-brand/30 bg-brand/5 text-brand text-sm font-semibold hover:bg-brand/10 transition-all flex items-center justify-center gap-2"
                  >
                    Register as Partner
                    <Scissors className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-5">
            {tab === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => switchTab(tab === "login" ? "register" : "login")}
              className="text-brand hover:text-brand/80 font-medium transition-colors"
            >
              {tab === "login" ? "Register" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}
