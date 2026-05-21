"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/barberhub/navbar"
import {
  Scissors,
  Building2,
  MapPin,
  Phone,
  Mail,
  User,
  Lock,
  Eye,
  EyeOff,
  Check,
  ArrowRight,
  MailCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { api, CITIES } from "@/lib/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

const benefits = [
  "Reach thousands of new clients",
  "Easy online booking management",
  "Staff scheduling and management",
  "Analytics and revenue tracking",
  "No upfront costs - pay only when you earn",
]

export default function PartnerRegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registered, setRegistered] = useState(false) // ← New screen "Check your email"
  const [registeredEmail, setRegisteredEmail] = useState("")

  const [formData, setFormData] = useState({
    // Step 1: Business Info
    salonName: "",
    address: "",
    city: "Almaty",
    phone: "",
    // Step 2: Account Info
    ownerName: "",
    email: "",
    password: "",
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  function handleStep1Submit(e: React.FormEvent) {
    e.preventDefault()
    setStep(2)
  }

  async function handleStep2Submit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      // 1. Register user only (no login or salon creation yet)
      // Role is always "client" on registration — backend upgrades to "owner"
      // automatically when the salon is created after email verification.
      await api.register({
        email: formData.email,
        password: formData.password,
        full_name: formData.ownerName,
        phone: formData.phone,
      })

      // 2. Save salon data to localStorage to create AFTER verification
      // IMPORTANT: Use localStorage (not sessionStorage) since email link opens in a NEW tab
      localStorage.setItem("pending_salon", JSON.stringify({
        name: formData.salonName,
        address: formData.address,
        city: formData.city,
        owner_id: "00000000-0000-0000-0000-000000000000", // will be overridden by backend
      }))

      // 3. Save email for auto-login (only in localStorage, do not save password for security)
      localStorage.setItem("pending_email", formData.email)

      // 4. Show "Check your email" screen
      setRegisteredEmail(formData.email)
      setRegistered(true)

    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const step1Valid =
    formData.salonName && formData.address && formData.city && formData.phone
  const step2Valid = formData.ownerName && formData.email && formData.password

  // ─── "Email Sent" Screen ──────────────────────────────────────────────
  if (registered) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-16 px-6 flex items-center justify-center min-h-screen">
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 rounded-full bg-brand/10 flex items-center justify-center mx-auto mb-6">
              <MailCheck className="w-10 h-10 text-brand" />
            </div>
            <h1 className="font-display font-bold text-3xl text-foreground mb-3">
              Check your email
            </h1>
            <p className="text-muted-foreground mb-2">
              We've sent a verification link to:
            </p>
            <p className="text-brand font-semibold text-lg mb-6">
              {registeredEmail}
            </p>
            <div className="bg-surface border border-border-solid rounded-2xl p-6 mb-6 text-left space-y-3">
              <p className="text-sm font-semibold text-foreground">Next steps:</p>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-brand text-xs font-bold">1</span>
                </div>
                <p className="text-sm text-muted-foreground">Open the email and click the verification link</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-brand text-xs font-bold">2</span>
                </div>
                <p className="text-sm text-muted-foreground">After verification, sign in to complete your salon setup</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-brand text-xs font-bold">3</span>
                </div>
                <p className="text-sm text-muted-foreground">Sign in &rarr; complete quick salon setup (name, hours) &rarr; done!</p>
              </div>
            </div>
            <Link
              href="/login"
              className="w-full py-3 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-all brand-glow flex items-center justify-center gap-2"
            >
              Go to Sign In
              <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-xs text-muted-foreground mt-4">
              Didn't receive the email? Check your spam folder.
            </p>
          </div>
        </div>
      </div>
    )
  }
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-24 pb-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Left: Benefits */}
            <div className="lg:pr-8">
              <div className="sticky top-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-brand flex items-center justify-center brand-glow">
                    <Building2 className="w-6 h-6 text-brand-foreground" />
                  </div>
                  <div>
                    <h1 className="font-display font-bold text-2xl text-foreground">
                      Partner with BarberHub
                    </h1>
                    <p className="text-muted-foreground text-sm">
                      Grow your barbershop business
                    </p>
                  </div>
                </div>

                <p className="text-muted-foreground mb-8 leading-relaxed">
                  Join hundreds of barbershops already using BarberHub to manage
                  bookings, staff, and grow their client base. Get started in
                  minutes.
                </p>

                <div className="space-y-4 mb-8">
                  {benefits.map((benefit) => (
                    <div
                      key={benefit}
                      className="flex items-center gap-3 text-foreground"
                    >
                      <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3.5 h-3.5 text-brand" />
                      </div>
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>

                <div className="p-4 bg-surface rounded-xl border border-border-solid">
                  <p className="text-sm text-muted-foreground mb-2">
                    Already a partner?
                  </p>
                  <Link
                    href="/login"
                    className="text-brand font-medium hover:underline"
                  >
                    Sign in to your dashboard
                  </Link>
                </div>
              </div>
            </div>

            {/* Right: Form */}
            <div>
              {/* Progress */}
              <div className="flex items-center gap-4 mb-8">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold",
                      step >= 1
                        ? "bg-brand text-brand-foreground"
                        : "bg-surface-elevated text-muted-foreground"
                    )}
                  >
                    {step > 1 ? <Check className="w-4 h-4" /> : "1"}
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      step >= 1 ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    Business Info
                  </span>
                </div>
                <div
                  className={cn(
                    "flex-1 h-0.5",
                    step > 1 ? "bg-brand" : "bg-surface-elevated"
                  )}
                />
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold",
                      step >= 2
                        ? "bg-brand text-brand-foreground"
                        : "bg-surface-elevated text-muted-foreground"
                    )}
                  >
                    2
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      step >= 2 ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    Account
                  </span>
                </div>
              </div>

              {error && (
                <Alert variant="destructive" className="mb-6 bg-destructive/10 border-destructive/20 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              <div className="bg-surface border border-border-solid rounded-2xl p-6 sm:p-8">
                {/* Step 1: Business Info */}
                {step === 1 && (
                  <form onSubmit={handleStep1Submit}>
                    <h2 className="font-display font-bold text-xl text-foreground mb-6">
                      Tell us about your barbershop
                    </h2>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          Barbershop Name
                        </label>
                        <div className="relative">
                          <Scissors className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <input
                            type="text"
                            name="salonName"
                            value={formData.salonName}
                            onChange={handleChange}
                            placeholder="e.g., Classic Cuts & Shaves"
                            className="w-full pl-12 pr-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          Street Address
                        </label>
                        <div className="relative">
                          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <input
                            type="text"
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            placeholder="Street and number"
                            className="w-full pl-12 pr-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          City
                        </label>
                        <select
                          name="city"
                          value={formData.city}
                          onChange={handleChange}
                          className="w-full px-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand appearance-none"
                          required
                        >
                          {CITIES.filter(c => c !== "All Cities").map(city => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          Business Phone
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <input
                            type="tel"
                            name="phone"
                            value={formData.phone}
                            onChange={handleChange}
                            placeholder="+7 777 000 0000"
                            className="w-full pl-12 pr-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={!step1Valid}
                      className={cn(
                        "w-full mt-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all",
                        step1Valid
                          ? "bg-brand text-brand-foreground hover:bg-brand/90 brand-glow-sm"
                          : "bg-surface-elevated text-muted-foreground cursor-not-allowed"
                      )}
                    >
                      Continue
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                )}

                {/* Step 2: Account Info */}
                {step === 2 && (
                  <form onSubmit={handleStep2Submit}>
                    <h2 className="font-display font-bold text-xl text-foreground mb-6">
                      Create your account
                    </h2>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          Your Name
                        </label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <input
                            type="text"
                            name="ownerName"
                            value={formData.ownerName}
                            onChange={handleChange}
                            placeholder="Full Name"
                            className="w-full pl-12 pr-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          Email Address
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="you@yoursalon.com"
                            className="w-full pl-12 pr-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          Password
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <input
                            type={showPassword ? "text" : "password"}
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="Create a strong password"
                            className="w-full pl-12 pr-12 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showPassword ? (
                              <EyeOff className="w-5 h-5" />
                            ) : (
                              <Eye className="w-5 h-5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground mt-4">
                      By creating an account, you agree to our{" "}
                      <a href="#" className="text-brand hover:underline">
                        Terms of Service
                      </a>{" "}
                      and{" "}
                      <a href="#" className="text-brand hover:underline">
                        Privacy Policy
                      </a>
                      .
                    </p>

                    <div className="flex items-center gap-3 mt-6">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="px-6 py-3 rounded-xl font-medium text-foreground hover:bg-surface-elevated transition-colors"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={!step2Valid || isSubmitting}
                        className={cn(
                          "flex-1 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all",
                          step2Valid && !isSubmitting
                            ? "bg-brand text-brand-foreground hover:bg-brand/90 brand-glow"
                            : "bg-surface-elevated text-muted-foreground cursor-not-allowed"
                        )}
                      >
                        {isSubmitting ? (
                          <>
                            <span className="w-5 h-5 border-2 border-brand-foreground/30 border-t-brand-foreground rounded-full animate-spin" />
                            Creating Account...
                          </>
                        ) : (
                          <>
                            Create Partner Account
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
