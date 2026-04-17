"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  Building2, 
  MapPin, 
  Clock, 
  ChevronRight, 
  Loader2,
  CheckCircle2,
} from "lucide-react"
import { api, CITIES } from "@/lib/api"
import { cn } from "@/lib/utils"

// Filter out "All Cities" for the selection
const SELECTABLE_CITIES = CITIES.filter(c => c !== "All Cities")

interface OnboardingWizardProps {
  userId: string
  onComplete: () => void
}

export function OnboardingWizard({ userId, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1: Basic info — pre-filled from localStorage if available
  const [salonData, setSalonData] = useState(() => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("pending_salon")
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          return {
            name: parsed.name || "",
            address: parsed.address || "",
            city: parsed.city || "Almaty",
            description: parsed.description || "",
          }
        } catch {}
      }
    }
    return { name: "", address: "", city: "Almaty", description: "" }
  })

  // Step 2: Operating hours (always editable)
  const [operatingHours, setOperatingHours] = useState<Record<string, string[]>>({
    "0": ["09:00", "21:00"],
    "1": ["09:00", "21:00"],
    "2": ["09:00", "21:00"],
    "3": ["09:00", "21:00"],
    "4": ["09:00", "21:00"],
    "5": ["10:00", "20:00"],
    "6": ["10:00", "18:00"],
  })

  const handleCreateSalon = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem("token")
      if (!token) throw new Error("Authentication required. Please log in again.")

      // Re-check verification status before attempting creation
      let currentUser: any = null
      try {
        currentUser = await api.getMe(token)
        localStorage.setItem("user", JSON.stringify(currentUser))
      } catch {
        throw new Error("Session expired. Please log in again.")
      }

      if (!currentUser.is_verified) {
        setError("⚠️ Email is not verified. Please check your inbox, click the verification link, then refresh this page and try again.")
        setLoading(false)
        return
      }

      // Create salon with all data (basic info + operating hours) in one call
      await api.createSalon({
        name: salonData.name,
        address: salonData.address,
        city: salonData.city,
        description: salonData.description,
        owner_id: currentUser.id,
        operating_hours: operatingHours,
      }, token)

      // Clear pending salon data from registration flow (localStorage)
      localStorage.removeItem("pending_salon")
      localStorage.removeItem("pending_email")

      setStep(3)
    } catch (err: any) {
      const msg: string = typeof err.message === "string" ? err.message : String(err)
      console.error("[Wizard] Salon creation error:", msg, err)

      // Already user-friendly
      if (msg.startsWith("⚠️")) { setError(msg); return }

      // Salon already exists
      if (msg.toLowerCase().includes("already") || msg.includes("409")) {
        localStorage.removeItem("pending_salon")
        localStorage.removeItem("pending_email")
        setStep(3)
        return
      }

      // 403 / not verified
      if (msg.includes("403") || msg.toLowerCase().includes("not verified") || msg.toLowerCase().includes("verified")) {
        setError("⚠️ Your email is not verified yet. Please check your inbox and click the verification link, then try again.")
        return
      }

      // Network / fetch error
      if (msg.toLowerCase().includes("failed to fetch")) {
        setError("❌ Network error. Please check your connection and try again.")
        return
      }

      // Show the actual error (helps debugging)
      setError(`Failed to create salon: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

  const totalSteps = 3

  return (
    <div className="max-w-2xl mx-auto py-12 px-6">
      {/* Progress Header */}
      <div className="flex items-center justify-between mb-12">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all",
              step === s ? "bg-brand text-brand-foreground" : 
              step > s ? "bg-brand/20 text-brand" : "bg-sidebar-accent text-muted-foreground"
            )}>
              {step > s ? <CheckCircle2 className="w-6 h-6" /> : s}
            </div>
            {s < 3 && (
              <div className={cn(
                "w-20 h-0.5 mx-2 rounded-full transition-all",
                step > s ? "bg-brand/40" : "bg-sidebar-accent"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Salon Info */}
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-2">
            <h1 className="text-3xl font-display font-bold text-foreground">Welcome to BarberHub!</h1>
            <p className="text-muted-foreground">Let&apos;s set up your salon. Fill in your barbershop details below.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground ml-1">Salon Name</label>
              <div className="relative">
                <Building2 className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="e.g. Classic Cuts & Shaves"
                  className="w-full pl-12 pr-4 py-3.5 bg-sidebar-accent border-none rounded-2xl text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-brand transition-all"
                  value={salonData.name}
                  onChange={(e) => setSalonData({ ...salonData, name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground ml-1">Street Address</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Street and number"
                  className="w-full pl-12 pr-4 py-3.5 bg-sidebar-accent border-none rounded-2xl text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-brand transition-all"
                  value={salonData.address}
                  onChange={(e) => setSalonData({ ...salonData, address: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground ml-1">City</label>
              <select
                className="w-full px-4 py-3.5 bg-sidebar-accent border-none rounded-2xl text-foreground focus:ring-2 focus:ring-brand transition-all appearance-none"
                value={salonData.city}
                onChange={(e) => setSalonData({ ...salonData, city: e.target.value })}
              >
                {SELECTABLE_CITIES.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground ml-1">Description (optional)</label>
              <textarea
                placeholder="Tell clients what makes your salon special..."
                rows={3}
                className="w-full px-4 py-3.5 bg-sidebar-accent border-none rounded-2xl text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-brand transition-all resize-none"
                value={salonData.description}
                onChange={(e) => setSalonData({ ...salonData, description: e.target.value })}
              />
            </div>
          </div>

          <button
            disabled={!salonData.name || !salonData.address}
            onClick={() => setStep(2)}
            className="w-full py-4 bg-brand text-brand-foreground rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-brand/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Step 2: Operating Hours */}
      {step === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-2">
            <h2 className="text-3xl font-display font-bold text-foreground">Opening Hours</h2>
            <p className="text-muted-foreground">When is your salon open? You can update this anytime from Settings.</p>
          </div>

          <div className="bg-sidebar-accent rounded-3xl p-6 space-y-4">
            {DAYS.map((day, idx) => (
              <div key={day} className="flex items-center justify-between gap-4">
                <span className="w-24 font-medium text-foreground text-sm">{day}</span>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="time"
                    className="flex-1 bg-background border-none rounded-xl px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-brand"
                    value={operatingHours[String(idx)][0]}
                    onChange={(e) => {
                      const newHours = { ...operatingHours }
                      newHours[String(idx)] = [e.target.value, newHours[String(idx)][1]]
                      setOperatingHours(newHours)
                    }}
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <input
                    type="time"
                    className="flex-1 bg-background border-none rounded-xl px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-brand"
                    value={operatingHours[String(idx)][1]}
                    onChange={(e) => {
                      const newHours = { ...operatingHours }
                      newHours[String(idx)] = [newHours[String(idx)][0], e.target.value]
                      setOperatingHours(newHours)
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {error && (
            <p className="text-destructive text-sm bg-destructive/10 p-4 rounded-xl border border-destructive/20">
              {error}
            </p>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-4 bg-sidebar-accent text-foreground rounded-2xl font-bold hover:bg-sidebar-accent/80 transition-all"
            >
              Back
            </button>
            <button
              disabled={loading}
              onClick={handleCreateSalon}
              className="flex-[2] py-4 bg-brand text-brand-foreground rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-brand/90 transition-all disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Clock className="w-5 h-5" />
                  Create My Salon
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Success */}
      {step === 3 && (
        <div className="text-center space-y-8 animate-in zoom-in duration-500">
          <div className="w-24 h-24 bg-brand/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-12 h-12 text-brand" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-3xl font-display font-bold text-foreground">Salon Created! 🎉</h2>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Your salon is now live on BarberHub. Head to the dashboard to add your services and staff members.
            </p>
          </div>

          <button
            onClick={onComplete}
            className="w-full py-4 bg-brand text-brand-foreground rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-brand/90 transition-all shadow-lg shadow-brand/20"
          >
            Go to Dashboard
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  )
}
