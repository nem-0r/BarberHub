"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Calendar,
  Clock,
  CheckCircle2,
  User,
  ExternalLink,
  Loader2,
  Scissors
} from "lucide-react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  queryKeys,
  useStaffByUserQuery,
  useBookingsForStaffQuery,
} from "@/lib/queries"
import { formatTimeInSalonTz, isSameSalonDay } from "@/lib/datetime"
import { toast } from "sonner"

interface StaffDashboardProps {
  user: any
  salon: any
}

export function StaffDashboard({ user, salon }: StaffDashboardProps) {
  const queryClient = useQueryClient()
  const [completing, setCompleting] = useState<string | null>(null)

  // Token is read once per action; the queries themselves don't need it for
  // the staff profile fetch (public-by-id endpoint).
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null

  // Cache-shared with sidebar/schedule page — no duplicate request.
  const staffProfileQuery = useStaffByUserQuery(salon ? user?.id : null)
  const staffProfile = staffProfileQuery.data
  const bookingsQuery = useBookingsForStaffQuery(staffProfile?.id, token)
  const appointments: any[] = bookingsQuery.data ?? []

  const updateBookingCache = (bookingId: string, status: string) => {
    if (!staffProfile) return
    queryClient.setQueryData<any[]>(
      queryKeys.bookingsForStaff(staffProfile.id),
      (prev) => (prev ?? []).map(a => a.id === bookingId ? { ...a, status } : a),
    )
  }

  const handleComplete = async (bookingId: string) => {
    setCompleting(bookingId)
    try {
      if (!token) return
      await api.updateBookingStatus(bookingId, "completed", token)
      updateBookingCache(bookingId, "completed")
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || "Failed to complete booking")
    } finally {
      setCompleting(null)
    }
  }

  // First-paint loading: only block when we have nothing to show yet.
  const initialLoading =
    !!salon &&
    ((staffProfileQuery.isLoading && !staffProfile) ||
      (bookingsQuery.isLoading && !bookingsQuery.data))

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-12 h-12 text-brand animate-spin" />
        <p className="mt-4 text-muted-foreground">Loading your appointments...</p>
      </div>
    )
  }

  if (!salon) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Scissors className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Not assigned to a salon yet</h2>
        <p className="text-muted-foreground max-w-sm">
          You have not been added to a salon by an owner. Please contact your manager.
        </p>
      </div>
    )
  }

  // "Today" is salon-local — comparing by salon TZ avoids midnight drift for
  // staff in a different timezone than the salon.
  const salonTz = salon?.timezone
  const todayApts = appointments.filter(a => isSameSalonDay(a.start_time, a.salon_timezone ?? salonTz))
  const upcomingApts = appointments.filter(
    a => !isSameSalonDay(a.start_time, a.salon_timezone ?? salonTz) && a.status === "confirmed",
  )

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">My Appointments</h1>
          <p className="text-muted-foreground">Hello, {user.full_name}! Here is your schedule for today.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-brand/10 text-brand rounded-xl">
          <Calendar className="w-4 h-4" />
          <span className="text-sm font-bold">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      {/* Today's Focus */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Clock className="w-5 h-5 text-brand" />
          Today&apos;s Schedule
        </h2>
        
        {todayApts.length === 0 ? (
          <div className="bento-card py-12 text-center">
            <p className="text-muted-foreground">No appointments scheduled for today.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {todayApts.map((apt) => (
              <div key={apt.id} className="bento-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-sidebar-accent flex flex-col items-center justify-center">
                    <span className="text-xs font-bold text-brand">{formatTimeInSalonTz(apt.start_time, apt.salon_timezone ?? salonTz)}</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{apt.client_full_name ?? "Client"}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Scissors className="w-3 h-3" />
                      {apt.service_name ?? "Service"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto mt-4 sm:mt-0 flex-wrap">
                  <div className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider",
                    apt.status === "confirmed" ? "bg-brand/10 text-brand" :
                    apt.status === "pending" ? "bg-gold/10 text-gold" :
                    apt.status === "completed" ? "bg-green-500/10 text-green-500" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {apt.status}
                  </div>
                  {apt.status === "confirmed" && (
                    <button
                      disabled={completing === apt.id}
                      onClick={() => handleComplete(apt.id)}
                      className="ml-auto sm:ml-0 flex-1 sm:flex-none px-4 py-2 bg-brand text-brand-foreground rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-brand/90 transition-all shadow-md shadow-brand/20"
                    >
                      {completing === apt.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Done
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Stats Summary — all from real data */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bento-card bg-brand/5 border-brand/10">
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Today</p>
          <p className="text-2xl font-bold text-foreground">{todayApts.length}</p>
          <p className="text-xs text-muted-foreground">Bookings</p>
        </div>
        <div className="bento-card bg-gold/5 border-gold/10">
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Upcoming</p>
          <p className="text-2xl font-bold text-foreground">{upcomingApts.length}</p>
          <p className="text-xs text-muted-foreground">Confirmed</p>
        </div>
        <div className="bento-card">
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Completed</p>
          <p className="text-2xl font-bold text-foreground">
            {appointments.filter(a => a.status === "completed").length}
          </p>
          <p className="text-xs text-muted-foreground">All time</p>
        </div>
        <div className="bento-card">
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Rating</p>
          <p className="text-2xl font-bold text-foreground">
            {staffProfile?.rating != null ? staffProfile.rating.toFixed(1) : "—"}
          </p>
          <p className="text-xs text-muted-foreground">Out of 5.0</p>
        </div>
      </div>
    </div>
  )
}
