"use client"

import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useMeQuery, useBookingsForClientQuery, queryKeys } from "@/lib/queries"
import { formatTimeInSalonTz, formatDateInSalonTz } from "@/lib/datetime"
import { signOut } from "@/lib/auth"
import {
  Loader2,
  Calendar,
  User,
  Bell,
  ChevronRight,
  LogOut,
  Clock,
  Scissors,
  Save,
  Phone,
  Mail,
  Shield,
} from "lucide-react"
import { Navbar } from "@/components/barberhub/navbar"
import Link from "next/link"
import Image from "next/image"

const NAV_ITEMS = [
  { icon: Calendar, label: "My Bookings", id: "appointments" },
  { icon: User, label: "Personal Info", id: "profile" },
  { icon: Bell, label: "Notifications", id: "notifications" },
]

function clearAuthAndRedirect(router: ReturnType<typeof useRouter>) {
  localStorage.removeItem("token")
  localStorage.removeItem("user")
  router.replace("/login")
}

export default function ProfilePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [activeNav, setActiveNav] = useState("appointments")
  const [profileForm, setProfileForm] = useState({ full_name: "", phone: "" })
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)

  // Auth bootstrap: read once on mount. We only re-render when the underlying
  // localStorage values matter for query.enabled.
  const [authState, setAuthState] = useState<{ token: string | null; cachedUser: any | null }>(
    { token: null, cachedUser: null }
  )

  useEffect(() => {
    const token = localStorage.getItem("token")
    const userStr = localStorage.getItem("user")
    if (!token || !userStr) {
      router.replace("/login")
      return
    }
    let parsed: any = null
    try { parsed = JSON.parse(userStr) } catch { /* corrupt cache → redirect */ }
    if (!parsed) {
      clearAuthAndRedirect(router)
      return
    }
    // Cheap role check before any fetch fires.
    if (parsed.role === "staff" || parsed.role === "owner" || parsed.role === "admin") {
      router.replace("/partner/dashboard")
      return
    }
    setAuthState({ token, cachedUser: parsed })
  }, [router])

  const meQuery = useMeQuery(authState.token)
  const bookingsQuery = useBookingsForClientQuery(authState.cachedUser?.id, authState.token)

  // Single source of truth for "the current user": fresh from server if loaded,
  // otherwise the localStorage snapshot we bootstrapped with.
  const user = meQuery.data ?? authState.cachedUser

  // 401 from any of the queries → token is dead, bounce to login.
  useEffect(() => {
    const meErr: any = meQuery.error
    const bookErr: any = bookingsQuery.error
    if (meErr?.code === "UNAUTHORIZED" || bookErr?.code === "UNAUTHORIZED") {
      clearAuthAndRedirect(router)
    }
  }, [meQuery.error, bookingsQuery.error, router])

  // Server-side role change (client → owner) — re-route after refresh.
  useEffect(() => {
    if (meQuery.data) {
      localStorage.setItem("user", JSON.stringify(meQuery.data))
      if (meQuery.data.role !== "client") {
        router.replace("/partner/dashboard")
      }
    }
  }, [meQuery.data, router])

  // Initial form values — set once when user data first arrives, then user drives it.
  useEffect(() => {
    if (user && profileForm.full_name === "" && profileForm.phone === "") {
      setProfileForm({ full_name: user.full_name || "", phone: user.phone || "" })
    }
  }, [user, profileForm.full_name, profileForm.phone])

  const bookings = bookingsQuery.data ?? []
  // Loading: only block first render; subsequent visits hit the cache and show data immediately.
  const loading = !authState.cachedUser || (bookingsQuery.isLoading && !bookingsQuery.data)

  async function handleResetPassword() {
    if (!user?.email) return
    try {
      await api.forgotPassword(user.email)
      setSaveStatus({ type: "success", message: `Password reset link sent to ${user.email}` })
    } catch (err: any) {
      setSaveStatus({ type: "error", message: err.message || "Failed to send reset link" })
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = profileForm.full_name.trim()
    const trimmedPhone = profileForm.phone.trim()
    if (!trimmedName) {
      setSaveStatus({ type: "error", message: "Full name cannot be empty" })
      return
    }
    setSaving(true)
    setSaveStatus(null)
    try {
      const token = localStorage.getItem("token")
      if (!token) throw new Error("Not authenticated")
      const payload: { full_name?: string; phone?: string } = { full_name: trimmedName }
      if (trimmedPhone) payload.phone = trimmedPhone
      const updated = await api.updateMe(payload, token)
      // Optimistically replace the cached me query so other pages see the new data.
      queryClient.setQueryData(queryKeys.me(), updated)
      localStorage.setItem("user", JSON.stringify(updated))
      setSaveStatus({ type: "success", message: "Profile updated successfully!" })
    } catch (err: any) {
      setSaveStatus({ type: "error", message: err.message || "Failed to save changes" })
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const token = localStorage.getItem("token")
      if (!token) return
      const localUrl = URL.createObjectURL(file)
      // Optimistic local preview while the background task processes the upload.
      queryClient.setQueryData(queryKeys.me(), (prev: any) =>
        prev ? { ...prev, avatar_url: localUrl } : prev,
      )
      await api.uploadUserAvatar(file, token)
      setSaveStatus({ type: "success", message: "Avatar upload started! It will update in a few moments." })
    } catch (err: any) {
      setSaveStatus({ type: "error", message: err.message || "Failed to upload avatar" })
    }
  }

  function handleLogout() {
    signOut(queryClient)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-muted-foreground">Loading your profile...</p>
      </div>
    )
  }

  const upcoming = bookings.filter((b: any) => b.status === "confirmed" || b.status === "pending")
  const past = bookings.filter((b: any) => b.status === "completed" || b.status === "cancelled")

  // Real computed stats — no hardcode
  const totalBookings = bookings.length
  const totalSpent = bookings
    .filter((b: any) => b.status === "completed")
    .reduce((sum: number, b: any) => sum + parseFloat(b.final_price ?? "0"), 0)
  const memberSince = user?.created_at
    ? new Date(user.created_at).getFullYear()
    : "..."

  const initials = user?.full_name
    ? user.full_name.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase()
    : user?.email?.substring(0, 2).toUpperCase() ?? "BH"

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 pt-24 pb-16">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="lg:w-72 flex-shrink-0">
            {/* Profile Card */}
            <div className="bento-card mb-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-brand/20 border border-brand/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {user?.avatar_url ? (
                    <Image src={user.avatar_url} alt={user.full_name} width={56} height={56} className="object-cover w-full h-full" />
                  ) : (
                    <span className="font-display font-bold text-xl text-brand">{initials}</span>
                  )}
                </div>
                <div>
                  <p className="font-display font-bold text-lg text-foreground">{user?.full_name || "User"}</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                    <span className="text-xs text-brand font-medium">Member since {memberSince}</span>
                  </div>
                </div>
              </div>

              {/* Real stats */}
              <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-border-solid">
                {[
                  { label: "Bookings", value: String(totalBookings) },
                  { label: "Spent", value: `${isNaN(totalSpent) ? "0" : totalSpent.toFixed(0)} ₸` },
                  { label: "Upcoming", value: String(upcoming.length) },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="font-display font-bold text-lg text-foreground">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <nav className="bento-card space-y-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                    activeNav === item.id
                      ? "bg-brand/10 text-brand"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                  {activeNav === item.id && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
                </button>
              ))}
              <div className="border-t border-border-solid pt-1 mt-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-400/10 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-7">
              <h1 className="font-display font-bold text-2xl text-foreground">
                {NAV_ITEMS.find((n) => n.id === activeNav)?.label ?? "My Bookings"}
              </h1>
              {activeNav === "appointments" && (
                <Link
                  href="/"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-sm font-semibold hover:bg-brand/90 transition-all brand-glow-sm"
                >
                  <Calendar className="w-4 h-4" />
                  Find a Salon
                </Link>
              )}
            </div>

            {activeNav === "profile" && (
              <div className="bento-card">
                {saveStatus && (
                  <div className={cn(
                    "p-3 rounded-xl mb-6 text-sm font-medium",
                    saveStatus.type === "success" ? "bg-brand/10 text-brand" : "bg-destructive/10 text-destructive"
                  )}>
                    {saveStatus.message}
                  </div>
                )}
                <div className="flex items-center gap-4 mb-6">
                  <label className="relative cursor-pointer group">
                    <div className="w-16 h-16 rounded-2xl bg-brand/20 border-2 border-brand/30 flex items-center justify-center overflow-hidden">
                      {user?.avatar_url ? (
                        <Image src={user.avatar_url} alt={user.full_name} width={64} height={64} className="object-cover w-full h-full" />
                      ) : (
                        <span className="font-display font-bold text-xl text-brand">{initials}</span>
                      )}
                    </div>
                    <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-white text-xs font-bold">Edit</span>
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </label>
                  <div>
                    <p className="font-bold text-foreground">{user?.full_name}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          type="text"
                          value={profileForm.full_name}
                          onChange={(e) => setProfileForm(f => ({ ...f, full_name: e.target.value }))}
                          className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-elevated border border-border-solid text-foreground text-sm focus:outline-none focus:border-brand transition-colors"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Phone</label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          type="tel"
                          value={profileForm.phone}
                          onChange={(e) => setProfileForm(f => ({ ...f, phone: e.target.value }))}
                          className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-elevated border border-border-solid text-foreground text-sm focus:outline-none focus:border-brand transition-colors"
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="email"
                        value={user?.email || ""}
                        disabled
                        className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-elevated border border-border-solid text-muted-foreground text-sm cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-2.5 bg-brand text-brand-foreground rounded-xl text-sm font-semibold hover:bg-brand/90 disabled:opacity-50 transition-all brand-glow-sm"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      className="flex items-center gap-2 px-6 py-2.5 border border-destructive/30 text-destructive rounded-xl text-sm font-semibold hover:bg-destructive/10 transition-all"
                    >
                      <Shield className="w-4 h-4" />
                      Reset Password
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeNav !== "appointments" && activeNav !== "profile" && (
              <div className="bento-card py-14 text-center">
                <p className="text-muted-foreground text-sm">This section is coming soon.</p>
              </div>
            )}

            {/* Upcoming Appointments */}
            {activeNav === "appointments" && (<><section className="mb-8">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                Upcoming ({upcoming.length})
              </h2>

              {upcoming.length === 0 ? (
                <div className="bento-card py-14 text-center">
                  <Scissors className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-bold text-foreground mb-2">No upcoming appointments</h3>
                  <p className="text-muted-foreground text-sm mb-5">
                    Find a salon near you and book your first session
                  </p>
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-brand-foreground rounded-xl text-sm font-semibold hover:bg-brand/90 transition-all brand-glow-sm"
                  >
                    <Calendar className="w-4 h-4" />
                    Book Your First Cut
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {upcoming.map((appt: any) => (
                    <div key={appt.id} className="bento-card hover:border-brand/20 transition-all">
                      <div className="flex items-start gap-4">
                        <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-surface-elevated flex items-center justify-center">
                          <Scissors className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-display font-bold text-lg text-foreground">
                                {appt.service_name ?? "Service"}
                              </p>
                              <p className="text-sm text-muted-foreground capitalize">
                                {appt.staff_full_name ? `with ${appt.staff_full_name} · ` : ""}{appt.status}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 mt-3">
                            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Calendar className="w-3.5 h-3.5" />
                              {formatDateInSalonTz(appt.start_time, appt.salon_timezone)}
                            </span>
                            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Clock className="w-3.5 h-3.5" />
                              {formatTimeInSalonTz(appt.start_time, appt.salon_timezone)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-display font-bold text-xl text-foreground">{isNaN(parseFloat(appt.final_price)) ? "0" : parseFloat(appt.final_price).toFixed(0)} ₸</p>
                          <p className="text-xs text-muted-foreground">Pay at salon</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Past Appointments */}
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                History ({past.length})
              </h2>

              {past.length === 0 ? (
                <div className="bento-card py-10 text-center">
                  <p className="text-muted-foreground text-sm">
                    Your visit history will appear here after your first completed appointment.
                  </p>
                </div>
              ) : (
                <div className="bento-card p-0 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border-solid">
                        <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Service</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Status</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Date</th>
                        <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {past.map((p: any, i: number) => (
                        <tr
                          key={p.id}
                          className={cn(
                            "hover:bg-surface-elevated transition-colors",
                            i < past.length - 1 && "border-b border-border-solid"
                          )}
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-surface-elevated flex items-center justify-center flex-shrink-0">
                                <Scissors className="w-4 h-4 text-muted-foreground" />
                              </div>
                              <span className="text-sm font-medium text-foreground">
                                {p.service_name ?? "Service"}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 hidden md:table-cell">
                            <span className={cn(
                              "text-xs font-semibold px-2 py-1 rounded-full capitalize",
                              p.status === "completed" ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground"
                            )}>
                              {p.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm text-muted-foreground hidden sm:table-cell">
                            {formatDateInSalonTz(p.start_time, p.salon_timezone)}
                          </td>
                          <td className="px-5 py-4 text-right text-sm font-semibold text-foreground">
                            {isNaN(parseFloat(p.final_price)) ? "0" : parseFloat(p.final_price).toFixed(0)} ₸
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section></>)}
          </main>
        </div>
      </div>
    </div>
  )
}
