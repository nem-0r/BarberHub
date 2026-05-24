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
  Store,
  LogOut,
  ChevronRight,
  Menu,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useSalonByOwnerQuery,
  useStaffByUserQuery,
  useSalonByIdQuery,
} from "@/lib/queries"
import { signOut } from "@/lib/auth"

const ownerNavItems = [
  { href: "/partner/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/partner/dashboard/staff", label: "Staff", icon: Users },
  { href: "/partner/dashboard/services", label: "Services & Pricing", icon: DollarSign },
  { href: "/partner/dashboard/schedule", label: "Salon Schedule", icon: Calendar },
  { href: "/partner/dashboard/salon", label: "Salon Profile", icon: Store },
  { href: "/partner/dashboard/profile", label: "My Profile", icon: Settings },
]

const staffNavItems = [
  { href: "/partner/dashboard", label: "My Appointments", icon: Calendar },
  { href: "/partner/dashboard/schedule", label: "My Schedule", icon: Clock },
  { href: "/partner/dashboard/profile", label: "My Profile", icon: Settings },
]

export function PartnerSidebar() {
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const [user, setUser] = useState<any>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const userStr = localStorage.getItem("user")
    if (!userStr) return
    try {
      setUser(JSON.parse(userStr))
    } catch {
      // ignore corrupt cache
    }
  }, [])

  const isStaff = user?.role === "staff"
  const isOwner = user?.role === "owner" || user?.role === "admin"

  const ownerSalonQuery = useSalonByOwnerQuery(isOwner ? user?.id : null)

  const staffQuery = useStaffByUserQuery(isStaff ? user?.id : null)
  const staffSalonId = staffQuery.data?.salonId
  const staffSalonQuery = useSalonByIdQuery(isStaff ? staffSalonId : null)

  const salon = isOwner ? ownerSalonQuery.data : staffSalonQuery.data

  const handleLogout = () => {
    signOut(queryClient)
  }

  const navItems = user?.role === "staff" ? staffNavItems : ownerNavItems

  return (
    <>
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-xl bg-sidebar border border-sidebar-border text-foreground shadow-md"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

    <aside className={cn(
      "fixed top-0 left-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-40 transition-transform duration-200",
      "lg:translate-x-0",
      mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
    )}>
      <div className="p-6 border-b border-sidebar-border">
        <Link href="/partner/dashboard" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
            <Scissors className="w-4 h-4 text-brand-foreground" />
          </div>
          <span className="font-display font-bold text-foreground">
            Barber<span className="text-brand">Hub</span>
          </span>
        </Link>
      </div>

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

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
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

      <div className="p-4 border-t border-sidebar-border space-y-1">
        <Link
          href="/"
          onClick={() => setMobileOpen(false)}
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
    </>
  )
}
