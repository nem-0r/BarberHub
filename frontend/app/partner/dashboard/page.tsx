"use client"

import { PartnerSidebar } from "@/components/partner/partner-sidebar"
import { OnboardingWizard } from "@/components/partner/onboarding-wizard"
import { StaffDashboard } from "@/components/partner/staff-dashboard"
import {
  Calendar,
  DollarSign,
  Users,
  TrendingUp,
  Clock,
  Check,
  X,
  AlertCircle,
  Plus,
  Scissors
} from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts"
import { cn } from "@/lib/utils"
import Image from "next/image"
import Link from "next/link"
import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { Loader2 } from "lucide-react"
import { ImageUpload } from "@/components/ui/image-upload"

export default function PartnerDashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [salon, setSalon] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const loadDashboardData = async () => {
    setLoading(true)
    setError(null)
    try {
      const userStr = localStorage.getItem("user")
      const token = localStorage.getItem("token")
      if (!userStr || !token) {
        window.location.href = "/login"
        return
      }

      const currentUser = JSON.parse(userStr)

      // Always refresh user data from API to get latest state
      let freshUser = currentUser
      try {
        freshUser = await api.getMe(token)
        localStorage.setItem("user", JSON.stringify(freshUser))
      } catch {
        // Use cached if API fails
      }
      setUser(freshUser)
      
      try {
        let salonData;
        if (freshUser.role === "staff") {
          const staffProfile = await api.getStaffByUserId(freshUser.id)
          if (staffProfile) {
            salonData = await api.getSalonById(staffProfile.salonId)
          }
        } else {
          salonData = await api.getSalonByOwnerId(freshUser.id)
        }
        
        if (salonData) {
          setSalon(salonData)

          if (freshUser.role === "owner" || freshUser.role === "admin") {
            const [statsData, bookingsData] = await Promise.all([
              api.getSalonStats(salonData.id, token),
              api.getBookingsBySalon(salonData.id, token)
            ])
            setStats(statsData)
            setAppointments(bookingsData)
          }
        }
      } catch (err: any) {
        const isNotFound = err.message.includes("404") || 
                          err.message.toLowerCase().includes("not found")
        
        if (isNotFound) {
          if (currentUser.role === "owner" || currentUser.role === "admin") {
            setShowOnboarding(true)
          } else {
            setError("Your salon profile was not found. Please contact your manager.")
          }
        } else {
          throw err
        }
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Failed to load dashboard")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [])

  const handleSalonImageUpload = async (file: File) => {
    try {
      const token = localStorage.getItem("token")
      if (!token || !salon) return
      
      await api.uploadSalonImage(salon.id, file, token)
      alert("Salon image upload started! It will update shortly.")
    } catch (err: any) {
      alert(err.message || "Failed to upload salon image")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-muted-foreground">Preparing your workspace...</p>
      </div>
    )
  }

  if (showOnboarding) {
    return (
      <div className="min-h-screen bg-background">
        <OnboardingWizard 
          userId={user.id} 
          onComplete={() => {
            setShowOnboarding(false)
            loadDashboardData()
          }} 
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Notice</h2>
        <p className="text-muted-foreground mb-6 max-w-sm">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-8 py-3 bg-brand text-brand-foreground rounded-2xl font-bold hover:bg-brand/90 transition-all"
        >
          Try Again
        </button>
      </div>
    )
  }

  // Staff View
  if (user?.role === "staff") {
    return (
      <div className="min-h-screen bg-background">
        <PartnerSidebar />
        <main className="ml-64 p-8">
          {/* StaffDashboard handles salon=null gracefully internally */}
          <StaffDashboard user={user} salon={salon} />
        </main>
      </div>
    )
  }

  // Owner View Stats Parsing
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
      value: `$${stats?.weekly_revenue?.toFixed(2) || "0.00"}`,
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

  const today = new Date().toISOString().split('T')[0]
  const todayAppointments = appointments
    .filter(a => a.start_time.startsWith(today))
    .map(a => ({
      id: a.id,
      client: "Verified Client",
      service: `Service #${a.service_id.substring(0,8)}`,
      time: new Date(a.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: a.status,
    }))

  return (
    <div className="min-h-screen bg-background">
      <PartnerSidebar />

      <main className="ml-64 p-8">
        {/* Salon Cover & Header */}
        {(user?.role === "owner" || user?.role === "admin") && (
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

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display font-bold text-3xl text-foreground">
              {user?.role === "staff" ? "Dashboard" : salon?.name}
            </h1>
            <p className="text-muted-foreground mt-1">
              {user?.role === "staff" 
                ? `Working at ${salon?.name}` 
                : `Management overview for your salon in ${salon?.city}`
              }
            </p>
          </div>
          <div className="flex gap-3">
             <button className="flex items-center gap-2 px-4 py-2 bg-sidebar-accent text-foreground rounded-xl text-sm font-bold hover:bg-sidebar-accent/80 transition-all">
               <Settings className="w-4 h-4" />
               Salon Settings
             </button>
          </div>
        </div>

        {/* Metrics Grid */}
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
          {/* Today's Queue */}
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

          {/* Quick Actions */}
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
