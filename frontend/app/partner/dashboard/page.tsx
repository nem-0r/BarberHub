"use client"

import { PartnerSidebar } from "@/components/partner/partner-sidebar"
import { OnboardingWizard } from "@/components/partner/onboarding-wizard"
import { StaffDashboard } from "@/components/partner/staff-dashboard"
import {
  Calendar,
  DollarSign,
  Users,
  TrendingUp,
  AlertCircle,
  Plus,
  Scissors,
  Brain
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { Loader2 } from "lucide-react"
import { ImageUpload } from "@/components/ui/image-upload"
import {
  useMeQuery,
  useSalonByOwnerQuery,
  useSalonStatsQuery,
  useBookingsBySalonQuery,
  useStaffByUserQuery,
  useSalonByIdQuery,
  queryKeys,
} from "@/lib/queries"
import { formatTimeInSalonTz, isSameSalonDay } from "@/lib/datetime"

function clearAuthAndRedirect(router: ReturnType<typeof useRouter>) {
  localStorage.removeItem("token")
  localStorage.removeItem("user")
  router.replace("/login")
}

export default function PartnerDashboardPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  // Auth bootstrap.
  const [authState, setAuthState] = useState<{ token: string | null; cachedUser: any | null }>({
    token: null,
    cachedUser: null,
  })

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
    setAuthState({ token, cachedUser: parsed })
  }, [router])

  // ── Fresh user (cache-shared with /profile via queryKeys.me) ─────────────────
  const meQuery = useMeQuery(authState.token)
  const user = meQuery.data ?? authState.cachedUser
  const role: string | undefined = user?.role
  const userId: string | undefined = user?.id

  // Persist a fresh user snapshot back to localStorage so other tabs/sidebar see it.
  useEffect(() => {
    if (meQuery.data) localStorage.setItem("user", JSON.stringify(meQuery.data))
  }, [meQuery.data])

  // ── Owner/admin: salon by ownership ─────────────────────────────────────────
  const isOwner = role === "owner" || role === "admin"
  const ownerSalonQuery = useSalonByOwnerQuery(isOwner ? userId : null)

  // ── Staff: user → staff profile → salon. Both queries are cache-shared with
  // partner-sidebar / schedule page, so navigating between dashboard pages
  // does NOT re-fetch.
  const isStaff = role === "staff"
  const staffProfileQuery = useStaffByUserQuery(isStaff ? userId : null)
  const staffSalonQuery = useSalonByIdQuery(isStaff ? staffProfileQuery.data?.salonId : null)
  const staffSalon = staffSalonQuery.data
  const staffSalonLoading =
    isStaff && (staffProfileQuery.isLoading || staffSalonQuery.isLoading) && !staffSalon

  const salon = isOwner ? ownerSalonQuery.data : staffSalon
  const salonId: string | undefined = salon?.id

  // ── Stats + bookings (only for owner/admin, only when we have a salon) ─────
  const statsQuery = useSalonStatsQuery(
    isOwner ? salonId : null,
    authState.token,
  )
  const bookingsQuery = useBookingsBySalonQuery(
    isOwner ? salonId : null,
    authState.token,
  )

  // ── Onboarding: owner with no salon → 404 from getSalonByOwnerId ───────────
  const ownerSalonError: any = ownerSalonQuery.error
  const ownerSalonNotFound =
    isOwner &&
    ownerSalonError != null &&
    (ownerSalonError.status === 404 ||
      (typeof ownerSalonError.message === "string" &&
        ownerSalonError.message.toLowerCase().includes("not found")))

  // ── Centralized 401 handling: any query → token dead → login ───────────────
  useEffect(() => {
    const errors: any[] = [
      meQuery.error,
      ownerSalonQuery.error,
      staffProfileQuery.error,
      staffSalonQuery.error,
      statsQuery.error,
      bookingsQuery.error,
    ]
    if (errors.some((e) => e?.code === "UNAUTHORIZED")) {
      clearAuthAndRedirect(router)
    }
  }, [
    meQuery.error,
    ownerSalonQuery.error,
    staffProfileQuery.error,
    staffSalonQuery.error,
    statsQuery.error,
    bookingsQuery.error,
    router,
  ])

  // Clients have no partner dashboard — send them home.
  useEffect(() => {
    if (role === "client") router.replace("/")
  }, [role, router])

  // ── Loading: only block first render. Cached visits skip the spinner. ──────
  const initialAuthBooted = !!authState.cachedUser
  const meLoading = meQuery.isLoading && !user
  const salonLoading =
    (isOwner && ownerSalonQuery.isLoading && !salon) ||
    (role === "staff" && staffSalonLoading && !salon)
  const ownerDataLoading =
    isOwner && !!salonId &&
    ((statsQuery.isLoading && !statsQuery.data) ||
      (bookingsQuery.isLoading && !bookingsQuery.data))

  const loading = !initialAuthBooted || meLoading || (!ownerSalonNotFound && (salonLoading || ownerDataLoading))

  // ── Generic error (non-404 from owner salon, non-auth) ─────────────────────
  const genericError =
    !ownerSalonNotFound &&
    !!ownerSalonError &&
    ownerSalonError.code !== "UNAUTHORIZED"
      ? (ownerSalonError.message ?? "Failed to load dashboard")
      : null

  // ── Mutations / handlers ────────────────────────────────────────────────────
  const handleSalonImageUpload = async (file: File) => {
    try {
      const token = localStorage.getItem("token")
      if (!token || !salon) return
      await api.uploadSalonImage(salon.id, file, token)
      toast.success("Salon image upload started! It will update shortly.")
    } catch (err: any) {
      toast.error(err.message || "Failed to upload salon image")
    }
  }

  const refreshAfterOnboarding = () => {
    // Newly-created salon won't be in cache yet — invalidate so the salon-by-owner
    // query refetches, then dependent stats/bookings auto-fire.
    if (userId) queryClient.invalidateQueries({ queryKey: queryKeys.salonByOwner(userId) })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-muted-foreground">Preparing your workspace...</p>
      </div>
    )
  }

  if (ownerSalonNotFound) {
    if (isOwner) {
      return (
        <div className="min-h-screen bg-background">
          <OnboardingWizard
            userId={user.id}
            onComplete={refreshAfterOnboarding}
          />
        </div>
      )
    }
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Notice</h2>
        <p className="text-muted-foreground mb-6 max-w-sm">
          Your salon profile was not found. Please contact your manager.
        </p>
      </div>
    )
  }

  if (genericError) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Notice</h2>
        <p className="text-muted-foreground mb-6 max-w-sm">{genericError}</p>
        <button
          onClick={() => ownerSalonQuery.refetch()}
          className="px-8 py-3 bg-brand text-brand-foreground rounded-2xl font-bold hover:bg-brand/90 transition-all"
        >
          Try Again
        </button>
      </div>
    )
  }

  // ── Staff View ─────────────────────────────────────────────────────────────
  if (role === "staff") {
    return (
      <div className="min-h-screen bg-background">
        <PartnerSidebar />
        <main className="lg:ml-64 p-8">
          <StaffDashboard user={user} salon={salon} />
        </main>
      </div>
    )
  }

  // ── Owner View ─────────────────────────────────────────────────────────────
  const stats = statsQuery.data
  const appointments: any[] = bookingsQuery.data ?? []

  const metrics = [
    {
      label: "Today's Bookings",
      value: stats?.today_bookings?.toString() || "0",
      change: "Live",
      changeType: "neutral" as const,
      icon: Calendar,
    },
    {
      label: "Weekly Revenue",
      value: `${stats?.weekly_revenue?.toFixed(0) || "0"} ₸`,
      change: "Real-time",
      changeType: "positive" as const,
      icon: DollarSign,
    },
    {
      label: "Active Staff",
      value: stats?.active_staff?.toString() || "0",
      change: "0",
      changeType: "neutral" as const,
      icon: Users,
    },
    {
      label: "Avg. Rating",
      value: stats?.avg_rating?.toFixed(1) || "5.0",
      change: "From reviews",
      changeType: "positive" as const,
      icon: TrendingUp,
    },
  ]

  // Filter and format in the salon's local timezone, not the browser's.
  const salonTz = salon?.timezone
  const todayAppointments = appointments
    .filter((a: any) => isSameSalonDay(a.start_time, a.salon_timezone ?? salonTz))
    .map((a: any) => ({
      id: a.id,
      client: a.client_full_name ?? "Client",
      service: a.service_name ?? "Service",
      time: formatTimeInSalonTz(a.start_time, a.salon_timezone ?? salonTz),
      status: a.status,
    }))

  return (
    <div className="min-h-screen bg-background">
      <PartnerSidebar />

      <main className="lg:ml-64 p-8">
        {(role === "owner" || role === "admin") && (
          <div className="relative h-48 rounded-3xl overflow-hidden mb-8 group border border-border-solid shadow-sm">
            <ImageUpload
              value={salon?.coverImage}
              onChange={handleSalonImageUpload}
              aspectRatio="video"
              className="w-full h-full"
              description="Recommended: 1200x400"
            />
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display font-bold text-3xl text-foreground">
              {salon?.name}
            </h1>
            <p className="text-muted-foreground mt-1">
              Management overview for your salon in {salon?.city}
            </p>
          </div>
          <div className="flex gap-3">
             <Link href="/partner/dashboard/salon" className="flex items-center gap-2 px-4 py-2 bg-sidebar-accent text-foreground rounded-xl text-sm font-bold hover:bg-sidebar-accent/80 transition-all">
               <Settings className="w-4 h-4" />
               Salon Settings
             </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {metrics.map((metric) => (
            <div key={metric.label} className="bento-card flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center">
                <metric.icon className="w-6 h-6 text-brand" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{metric.value}</p>
                <p className="text-sm text-muted-foreground">{metric.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xl font-bold text-foreground">Today&apos;s Queue</h3>
            {todayAppointments.length === 0 ? (
              <div className="bento-card py-12 text-center">
                <p className="text-muted-foreground">No appointments for today yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayAppointments.map((apt) => (
                  <div key={apt.id} className="bento-card flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-sidebar-accent flex items-center justify-center font-bold text-brand">
                        {apt.time.split(' ')[0]}
                      </div>
                      <div>
                        <p className="font-bold text-foreground">{apt.client}</p>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest">{apt.service}</p>
                      </div>
                    </div>
                    <div className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold",
                      apt.status === "confirmed" ? "bg-brand/10 text-brand" : "bg-gold/10 text-gold"
                    )}>
                      {apt.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-bold text-foreground">Quick Actions</h3>
            <div className="grid grid-cols-1 gap-3">
               <Link
                 href="/partner/dashboard/staff"
                 className="flex items-center gap-3 p-4 bg-brand text-brand-foreground rounded-2xl font-bold hover:bg-brand/90 transition-all shadow-lg shadow-brand/10 group"
               >
                 <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center transition-transform group-hover:scale-110">
                   <Plus className="w-5 h-5" />
                 </div>
                 Add New Staff
               </Link>
               <Link
                 href="/partner/dashboard/services"
                 className="flex items-center gap-3 p-4 bg-sidebar-accent text-foreground rounded-2xl font-bold hover:bg-sidebar-accent/80 transition-all group"
               >
                 <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center transition-transform group-hover:scale-110">
                   <Scissors className="w-5 h-5 text-brand" />
                 </div>
                 Add Service
               </Link>
               <Link
                 href="/admin/ml"
                 className="flex items-center gap-3 p-4 bg-sidebar-accent text-foreground rounded-2xl font-bold hover:bg-sidebar-accent/80 transition-all group"
               >
                 <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center transition-transform group-hover:scale-110">
                   <Brain className="w-5 h-5 text-purple-400" />
                 </div>
                 Staff Skills Grader
               </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function Settings({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}
