"use client"

import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/queries"
import { PartnerSidebar } from "@/components/partner/partner-sidebar"
import {
  Loader2,
  Save,
  Store,
  Phone,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"

// Index 0..6 = Mon..Sun, matches backend datetime.weekday()
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

const TIMEZONES = [
  "Asia/Almaty",
  "Asia/Aqtobe",
  "Asia/Atyrau",
  "Asia/Oral",
  "Asia/Aqtau",
  "Asia/Qyzylorda",
  "UTC",
]

interface DayHours {
  open: string
  close: string
  closed: boolean
}

function buildDefaultHours(operating_hours: Record<string, [string, string]> | null | undefined): DayHours[] {
  return DAYS.map((_, i) => {
    const h = operating_hours?.[String(i)]
    if (Array.isArray(h) && h.length >= 2) {
      return { open: h[0], close: h[1], closed: false }
    }
    if (!operating_hours) return { open: "09:00", close: "21:00", closed: false }
    return { open: "09:00", close: "21:00", closed: true }
  })
}

export default function SalonProfilePage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [user, setUser] = useState<any>(null)
  const [salon, setSalon] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const [description, setDescription] = useState("")
  const [phone, setPhone] = useState("")
  const [timezone, setTimezone] = useState("Asia/Almaty")
  const [hours, setHours] = useState<DayHours[]>(buildDefaultHours(null))

  useEffect(() => {
    async function load() {
      const userStr = localStorage.getItem("user")
      if (!userStr) { router.replace("/login"); return }
      let parsed: any
      try { parsed = JSON.parse(userStr) } catch { router.replace("/login"); return }
      if (parsed.role !== "owner" && parsed.role !== "admin") {
        router.replace("/partner/dashboard")
        return
      }
      setUser(parsed)
      try {
        const s = await api.getSalonRawByOwnerId(parsed.id)
        setSalon(s)
        setDescription(s.description || "")
        setPhone(s.phone || "")
        setTimezone(s.timezone || "Asia/Almaty")
        setHours(buildDefaultHours(s.operating_hours))
      } catch (err: any) {
        setStatus({ type: "error", message: err.message || "Failed to load salon" })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  function updateDay(index: number, patch: Partial<DayHours>) {
    setHours(prev => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setStatus(null)

    for (let i = 0; i < hours.length; i++) {
      const d = hours[i]
      if (!d.closed && d.open >= d.close) {
        setStatus({ type: "error", message: `${DAYS[i]}: opening time must be before closing time` })
        return
      }
    }

    const operating_hours: Record<string, [string, string]> = {}
    hours.forEach((d, i) => {
      if (!d.closed) operating_hours[String(i)] = [d.open, d.close]
    })

    setSaving(true)
    try {
      const token = localStorage.getItem("token")
      if (!token) throw new Error("Not authenticated")
      const updated = await api.updateSalon(
        salon.id,
        { description: description.trim() || null, phone: phone.trim() || null, timezone, operating_hours },
        token,
      )
      setSalon(updated)
      queryClient.invalidateQueries({ queryKey: queryKeys.salonByOwner(user.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.salonById(salon.id) })
      setStatus({ type: "success", message: "Salon profile updated successfully!" })
    } catch (err: any) {
      setStatus({ type: "error", message: err.message || "Failed to save changes" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-muted-foreground">Loading salon profile...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <PartnerSidebar />

      <main className="lg:ml-64 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-brand/10 text-brand">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Salon Profile</h1>
              <p className="text-muted-foreground mt-1">
                Manage your salon's public details and business hours
              </p>
            </div>
          </div>

          {status && (
            <div className={cn(
              "p-4 rounded-xl mb-6 flex items-center gap-3",
              status.type === "success" ? "bg-brand/10 text-brand" : "bg-destructive/10 text-destructive"
            )}>
              {status.type === "success" ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <p className="text-sm font-medium">{status.message}</p>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-6">
            <div className="bento-card">
              <h3 className="text-xl font-bold text-foreground mb-6">Salon Details</h3>

              <div className="space-y-2 mb-4">
                <label className="text-sm font-medium text-muted-foreground ml-1">Salon Name</label>
                <input
                  type="text"
                  value={salon?.name || ""}
                  disabled
                  className="w-full px-4 py-3 bg-sidebar-accent border border-sidebar-border rounded-xl text-muted-foreground cursor-not-allowed"
                />
              </div>

              <div className="space-y-2 mb-4">
                <label className="text-sm font-medium text-muted-foreground ml-1">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 777 000 0000"
                    className="w-full pl-12 pr-4 py-3 bg-sidebar-accent border border-sidebar-border rounded-xl text-foreground focus:outline-none focus:border-brand transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <label className="text-sm font-medium text-muted-foreground ml-1">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-4 py-3 bg-sidebar-accent border border-sidebar-border rounded-xl text-foreground focus:outline-none focus:border-brand transition-all appearance-none"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground ml-1">
                  Open/Closed status and booking times are calculated in this timezone.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground ml-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Tell clients what makes your barbershop special..."
                  className="w-full px-4 py-3 bg-sidebar-accent border border-sidebar-border rounded-xl text-foreground focus:outline-none focus:border-brand transition-all resize-none"
                />
              </div>
            </div>

            <div className="bento-card">
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-5 h-5 text-brand" />
                <h3 className="text-xl font-bold text-foreground">Business Hours</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                These are the salon's open hours shown to clients. Each barber's
                personal schedule still applies within these hours.
              </p>

              <div className="space-y-3">
                {hours.map((d, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border-solid transition-colors",
                      d.closed ? "bg-muted/30 opacity-70" : "bg-surface-elevated/30"
                    )}
                  >
                    <div className="flex items-center gap-4 mb-4 sm:mb-0 min-w-[150px]">
                      <div className={cn("w-3 h-3 rounded-full", d.closed ? "bg-muted" : "bg-brand")} />
                      <span className="font-semibold text-foreground">{DAYS[index]}</span>
                    </div>

                    <div className="flex items-center gap-4">
                      {!d.closed ? (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <input
                            type="time"
                            value={d.open}
                            onChange={(e) => updateDay(index, { open: e.target.value })}
                            className="bg-surface-elevated border border-border-solid rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-brand"
                          />
                          <span className="text-muted-foreground">-</span>
                          <input
                            type="time"
                            value={d.close}
                            onChange={(e) => updateDay(index, { close: e.target.value })}
                            className="bg-surface-elevated border border-border-solid rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-brand"
                          />
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground italic">Closed</span>
                      )}

                      <div className="flex items-center gap-2 ml-4 pl-4 border-l border-border-solid">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={!d.closed}
                            onChange={() => updateDay(index, { closed: !d.closed })}
                          />
                          <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
                        </label>
                        <span className="text-xs text-muted-foreground w-12">
                          {!d.closed ? "Open" : "Closed"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-8 py-3 bg-brand text-brand-foreground rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-brand/90 transition-all shadow-lg shadow-brand/20 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Save Changes
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
