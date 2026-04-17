"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Scissors,
  LayoutDashboard,
  Users,
  Calendar,
  Clock,
  DollarSign,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"

const ownerNavItems = [
  { href: "/partner/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/partner/dashboard/staff", label: "Staff", icon: Users },
  { href: "/partner/dashboard/services", label: "Services & Pricing", icon: DollarSign },
  { href: "/partner/dashboard/schedule", label: "Salon Schedule", icon: Calendar },
  { href: "/partner/dashboard/profile", label: "My Profile", icon: Settings },
]

const staffNavItems = [
  { href: "/partner/dashboard", label: "My Appointments", icon: Calendar },
  { href: "/partner/dashboard/schedule", label: "My Schedule", icon: Clock },
  { href: "/partner/dashboard/profile", label: "My Profile", icon: Settings },
]

export function PartnerSidebar() {
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [salon, setSalon] = useState<any>(null)

  useEffect(() => {
    async function loadInfo() {
      try {
        const userStr = localStorage.getItem("user")
        if (userStr) {
          const currentUser = JSON.parse(userStr)
          setUser(currentUser)
          
          try {
            if (currentUser.role === "staff") {
              const staffData = await api.getStaffByUserId(currentUser.id)
              if (staffData) {
                const salonData = await api.getSalonById(staffData.salonId)
                setSalon(salonData)
              }
            } else {
              const salonData = await api.getSalonByOwnerId(currentUser.id)
              setSalon(salonData)
            }
          } catch (e) {
            // Salon might not exist yet
          }
        }
      } catch (err) {
        console.error("Failed to load info for sidebar", err)
      }
    }
    loadInfo()
  }, [])

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    window.location.href = "/"
  }

  const navItems = user?.role === "staff" ? staffNavItems : ownerNavItems

  return (
    <aside className="fixed top-0 left-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-40">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <Link href="/partner/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
            <Scissors className="w-4 h-4 text-brand-foreground" />
          </div>
          <span className="font-display font-bold text-foreground">
            Barber<span className="text-brand">Hub</span>
          </span>
        </Link>
      </div>

      {/* Salon Name / Info */}
      <div className="p-4 mx-4 mt-4 rounded-xl bg-sidebar-accent border border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
            <Scissors className="w-5 h-5 text-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              {user?.role === "staff" ? "Working at" : "Your Salon"}
            </p>
            <p className="font-semibold text-foreground truncate">
              {salon?.name || "Loading..."}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                isActive
                  ? "bg-brand/10 text-brand"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-sidebar-border space-y-1">
        <Link
          href="/"
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all"
        >
          <ChevronRight className="w-5 h-5" />
          View Marketplace
        </Link>
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
