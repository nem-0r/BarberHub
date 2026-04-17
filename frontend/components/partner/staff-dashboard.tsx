"use client"

import { useState, useEffect } from "react"
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

interface StaffDashboardProps {
  user: any
  salon: any
}

export function StaffDashboard({ user, salon }: StaffDashboardProps) {
  const [appointments, setAppointments] = useState<any[]>([])
  const [staffProfile, setStaffProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<string | null>(null)

  useEffect(() => {
    if (!salon) {
      setLoading(false)
      return
    }

    async function loadAppointments() {
      try {
        const token = localStorage.getItem("token")
        if (!token) return

        // Direct user→staff lookup (avoids scanning full salon list)
        const myProfile = await api.getStaffByUserId(user.id)
        if (!myProfile) return

        setStaffProfile(myProfile)

        // Use the staff-specific endpoint — staff are not authorized to view all salon bookings
        const data = await api.getBookingsForStaff(myProfile.id, token)
        setAppointments(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadAppointments()
  }, [salon?.id, user.id])

  const handleComplete = async (bookingId: string) => {
    setCompleting(bookingId)
    try {
      // In a real app, we'd have api.updateBookingStatus
      // For now, let's just simulate or use a generic update if available
      // Assuming POS status update exists
      await new Promise(r => setTimeout(r, 1000))
      setAppointments(prev => prev.map(a => a.id === bookingId ? { ...a, status: "completed" } : a))
    } catch (err) {
      console.error(err)
    } finally {
      setCompleting(null)
    }
  }

  if (loading) {
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

  const today = new Date().toISOString().split('T')[0]
  const todayApts = appointments.filter(a => a.start_time.startsWith(today))
  const upcomingApts = appointments.filter(a => !a.start_time.startsWith(today) && a.status === "confirmed")

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
                    <span className="text-xs font-bold text-brand">{new Date(apt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">Verified Client</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Scissors className="w-3 h-3" />
                      Service #{apt.service_id.substring(0, 8)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 w-full sm:w-auto mt-4 sm:mt-0">
                  <div className="px-3 py-1 bg-brand/10 text-brand rounded-lg text-xs font-bold uppercase tracking-wider">
                    {apt.status}
                  </div>
                  {apt.status === "confirmed" && (
                    <button
                      disabled={completing === apt.id}
                      onClick={() => handleComplete(apt.id)}
                      className="ml-auto sm:ml-0 flex-1 sm:flex-none px-6 py-2 bg-brand text-brand-foreground rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-brand/90 transition-all shadow-md shadow-brand/20"
                    >
                      {completing === apt.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Complete
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
