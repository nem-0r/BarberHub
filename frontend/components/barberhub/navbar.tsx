"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Scissors,
  Menu,
  X,
  Building2,
  User as UserIcon,
  LogOut,
  Calendar,
  LayoutDashboard,
  Settings,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"

const clientLinks = [
  { href: "/", label: "Discover" },
  { href: "/profile", label: "My Bookings" },
]

const partnerLinks = [
  { href: "/partner/dashboard", label: "Overview" },
  { href: "/partner/dashboard/staff", label: "Staff" },
  { href: "/partner/dashboard/services", label: "Services" },
]

function getDropdownItems(role: string) {
  if (role === "owner" || role === "admin") {
    return [
      { href: "/partner/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/partner/dashboard/staff", label: "Staff Management", icon: UserIcon },
      { href: "/partner/dashboard/profile", label: "Salon Settings", icon: Settings },
    ]
  }
  if (role === "staff") {
    return [
      { href: "/partner/dashboard", label: "My Workplace", icon: Scissors },
      { href: "/partner/dashboard/schedule", label: "My Schedule", icon: Calendar },
      { href: "/partner/dashboard/profile", label: "Profile Settings", icon: Settings },
    ]
  }
  // client
  return [
    { href: "/profile", label: "My Bookings", icon: Calendar },
    { href: "/", label: "Find a Barber", icon: Scissors },
    { href: "/profile", label: "Profile", icon: UserIcon },
  ]
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Partner",
  admin: "Admin",
  staff: "Barber",
  client: "Client",
}

export function Navbar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const userStr = localStorage.getItem("user")
    if (userStr) setUser(JSON.parse(userStr))
  }, [pathname])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    window.location.href = "/"
  }

  const isPartner = pathname.startsWith("/partner")
  const isAuth = pathname.startsWith("/auth") || pathname.startsWith("/login")
  const links = isPartner ? partnerLinks : clientLinks

  return (
    <header className="fixed top-0 inset-x-0 z-50 glass border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href={isPartner ? "/partner/dashboard" : "/"} className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center brand-glow-sm group-hover:scale-105 transition-transform">
            <Scissors className="w-4 h-4 text-brand-foreground" />
          </div>
          <span className="font-display font-bold text-lg text-foreground tracking-tight">
            Barber<span className="text-brand">Hub</span>
          </span>
          {isPartner && (
            <span className="ml-2 px-2 py-0.5 rounded-md bg-gold/20 text-gold text-xs font-semibold">
              Partner
            </span>
          )}
        </Link>

        {/* Desktop Nav */}
        {!isAuth && (
          <nav className="hidden md:flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  pathname === link.href
                    ? "bg-brand/10 text-brand"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}

        {/* Actions */}
        <div className="hidden md:flex items-center gap-3">
          {!isAuth && (
            <>
              {user ? (
                <div className="relative" ref={dropdownRef}>
                  {/* Trigger */}
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-surface-elevated transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon className="w-4 h-4 text-brand" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {user.full_name?.split(" ")[0]}
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
                        dropdownOpen && "rotate-180"
                      )}
                    />
                  </button>

                  {/* Dropdown Panel */}
                  {dropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border-solid rounded-2xl shadow-xl overflow-hidden z-50">
                      {/* Identity header */}
                      <div className="px-4 py-3 border-b border-border-solid">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-brand/10 text-brand uppercase tracking-wider">
                            {ROLE_LABELS[user.role] ?? user.role}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-foreground truncate">{user.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>

                      {/* Links */}
                      <div className="py-1">
                        {getDropdownItems(user.role).map((item) => (
                          <Link
                            key={item.label}
                            href={item.href}
                            onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-surface-elevated transition-colors"
                          >
                            <item.icon className="w-4 h-4 text-muted-foreground" />
                            {item.label}
                          </Link>
                        ))}
                      </div>

                      {/* Logout */}
                      <div className="border-t border-border-solid py-1">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-400/10 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {!isPartner && (
                    <Link
                      href="/auth/partner-register"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                    >
                      <Building2 className="w-4 h-4" />
                      For Business
                    </Link>
                  )}
                  <Link
                    href="/login"
                    className="px-4 py-2 rounded-xl bg-brand text-brand-foreground text-sm font-semibold hover:bg-brand/90 transition-colors brand-glow-sm"
                  >
                    Sign In
                  </Link>
                </>
              )}
            </>
          )}
        </div>

        {/* Mobile menu button */}
        {!isAuth && (
          <button
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        )}
      </div>

      {/* Mobile Menu */}
      {mobileOpen && !isAuth && (
        <div className="md:hidden border-t border-border bg-surface px-6 py-4 flex flex-col gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                pathname === link.href
                  ? "bg-brand/10 text-brand"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
              )}
            >
              {link.label}
            </Link>
          ))}
          {user ? (
            <>
              {getDropdownItems(user.role).map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-all"
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
              <button
                onClick={handleLogout}
                className="mt-1 flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-400/10 transition-all"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </>
          ) : (
            <>
              {!isPartner && (
                <Link
                  href="/auth/partner-register"
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  For Business
                </Link>
              )}
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="mt-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-sm font-semibold text-center"
              >
                Sign In
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  )
}
