"use client"

import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Loader2, Plus, Star, Edit, Trash2, User, Mail, Phone, X, Calendar, Scissors } from "lucide-react"
import { toast } from "sonner"
import Image from "next/image"
import Link from "next/link"
import { PartnerSidebar } from "@/components/partner/partner-sidebar"

interface StaffMember {
  id: string
  name: string
  role: string
  avatar: string
  email: string
  phone: string
  rating: number
  specialties: string[]
  status: "active" | "off"
  bookingsToday: number
}

const initialStaff: StaffMember[] = [
  {
    id: "1",
    name: "Marcus Johnson",
    role: "Master Barber",
    avatar: "/images/barber-1.jpg",
    email: "marcus@theblade.com",
    phone: "(555) 111-2222",
    rating: 4.9,
    specialties: ["Fades", "Beard Sculpting"],
    status: "active",
    bookingsToday: 5,
  },
  {
    id: "2",
    name: "Sofia Martinez",
    role: "Senior Stylist",
    avatar: "/images/barber-2.jpg",
    email: "sofia@theblade.com",
    phone: "(555) 333-4444",
    rating: 4.8,
    specialties: ["Creative Cuts", "Color"],
    status: "active",
    bookingsToday: 4,
  },
  {
    id: "3",
    name: "James Wilson",
    role: "Barber",
    avatar: "/images/barber-3.jpg",
    email: "james@theblade.com",
    phone: "(555) 555-6666",
    rating: 4.7,
    specialties: ["Classic Cuts", "Hot Shaves"],
    status: "off",
    bookingsToday: 0,
  },
  {
    id: "4",
    name: "Derek Thompson",
    role: "Junior Barber",
    avatar: "/images/barber-4.jpg",
    email: "derek@theblade.com",
    phone: "(555) 777-8888",
    rating: 4.6,
    specialties: ["Fades", "Line-ups"],
    status: "active",
    bookingsToday: 3,
  },
]

export default function StaffPage() {
  const router = useRouter()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [salon, setSalon] = useState<any>(null)
  
  const [showAddModal, setShowAddModal] = useState(false)
  const [newStaff, setNewStaff] = useState({
    name: "",
    role: "",
    email: "",
    phone: "",
    specialties: "",
  })

  useEffect(() => {
    async function loadStaff() {
      try {
        const userStr = localStorage.getItem("user")
        if (!userStr) {
          router.replace("/login")
          return
        }
        const user = JSON.parse(userStr)
        if (user.role !== "owner" && user.role !== "admin") {
          router.replace("/partner/dashboard")
          return
        }
        const salonData = await api.getSalonByOwnerId(user.id)
        setSalon(salonData)
        
        const staffData = await api.getBarbersBySalonId(salonData.id)
        setStaff(staffData)
      } catch (err: any) {
        console.error(err)
        setError(err.message || "Failed to load staff")
      } finally {
        setLoading(false)
      }
    }
    loadStaff()
  }, [])

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const token = localStorage.getItem("token")
      if (!token) throw new Error("No token found")
      
      await api.createStaff({
        full_name: newStaff.name,
        position: newStaff.role,
        email: newStaff.email,
        salon_id: salon.id,
        specialties: newStaff.specialties.split(",").map(s => s.trim())
      }, token)
      
      const staffData = await api.getBarbersBySalonId(salon.id)
      setStaff(staffData)
      setShowAddModal(false)
      setNewStaff({ name: "", role: "", email: "", phone: "", specialties: "" })
    } catch (err: any) {
      toast.error(err.message || "Failed to add staff")
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteStaff(id: string) {
    if (!confirm("Are you sure you want to remove this staff member?")) return
    
    try {
      const token = localStorage.getItem("token")
      if (!token) throw new Error("No token found")
      
      await api.deleteStaff(id, token)
      setStaff(staff.filter((s) => s.id !== id))
    } catch (err: any) {
      toast.error(err.message || "Failed to delete staff")
    }
  }

  async function toggleStatus(member: StaffMember) {
    try {
      const token = localStorage.getItem("token")
      if (!token) throw new Error("No token found")
      
      await api.updateStaff(member.id, { is_active: member.status !== "active" }, token)
      
      setStaff(staff.map(s => 
        s.id === member.id 
          ? { ...s, status: s.status === "active" ? "off" : "active" } 
          : s
      ))
    } catch (err: any) {
      toast.error("Failed to update status")
    }
  }

  const [svcModalStaff, setSvcModalStaff] = useState<StaffMember | null>(null)
  const [salonServices, setSalonServices] = useState<any[]>([])
  const [svcRows, setSvcRows] = useState<
    Record<string, { assigned: boolean; wasAssigned: boolean; price: string; origPrice: string }>
  >({})
  const [svcLoading, setSvcLoading] = useState(false)
  const [svcSaving, setSvcSaving] = useState(false)

  async function openServicesModal(member: StaffMember) {
    setSalonServices([])
    setSvcRows({})
    setSvcModalStaff(member)
    setSvcLoading(true)
    try {
      const [services, links] = await Promise.all([
        api.getServicesBySalonId(salon.id),
        api.getStaffServices(member.id),
      ])
      const active = services.filter((s: any) => s.isActive !== false)
      const linkMap = new Map<string, any>(
        (links as any[]).map((l) => [l.service_id, l]),
      )
      const rows: Record<string, any> = {}
      for (const s of active) {
        const link = linkMap.get(s.id)
        const p = link && link.custom_price != null ? String(link.custom_price) : ""
        rows[s.id] = { assigned: !!link, wasAssigned: !!link, price: p, origPrice: p }
      }
      setSalonServices(active)
      setSvcRows(rows)
    } catch (err: any) {
      toast.error(err.message || "Failed to load services")
      setSvcModalStaff(null)
    } finally {
      setSvcLoading(false)
    }
  }

  function setSvcRow(serviceId: string, patch: Partial<{ assigned: boolean; price: string }>) {
    setSvcRows((prev) => ({ ...prev, [serviceId]: { ...prev[serviceId], ...patch } }))
  }

  async function saveServices() {
    if (!svcModalStaff) return

    for (const s of salonServices) {
      const row = svcRows[s.id]
      if (!row || !row.assigned) continue
      const trimmed = row.price.trim()
      if (trimmed !== "") {
        const n = Number(trimmed)
        if (Number.isNaN(n) || n < 0) {
          toast.error(`Invalid price for "${s.name}"`)
          return
        }
      }
    }

    const token = localStorage.getItem("token")
    if (!token) { toast.error("Not authenticated. Please log in again."); return }

    setSvcSaving(true)
    const next = { ...svcRows }
    let failed: string | null = null
    for (const s of salonServices) {
      const row = next[s.id]
      if (!row) continue
      try {
        if (row.assigned) {
          const trimmed = row.price.trim()
          const priceNum = trimmed === "" ? null : Number(trimmed)
          const changed =
            !row.wasAssigned ||
            parseFloat(row.price || "0") !== parseFloat(row.origPrice || "0")
          if (changed) {
            await api.assignStaffService(svcModalStaff.id, s.id, priceNum, token)
            next[s.id] = { ...row, wasAssigned: true, origPrice: trimmed }
          }
        } else if (row.wasAssigned) {
          await api.removeStaffService(svcModalStaff.id, s.id, token)
          next[s.id] = { ...row, wasAssigned: false, origPrice: "" }
        }
      } catch (err: any) {
        failed = `${s.name}: ${err.message || "save failed"}`
        break
      }
    }
    setSvcRows(next)
    setSvcSaving(false)
    if (failed) {
      toast.error(`Saved up to — ${failed}. Press Save again to retry the rest.`)
    } else {
      setSvcModalStaff(null)
    }
  }

  if (loading && !salon) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-muted-foreground">Loading your team...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <PartnerSidebar />

      <main className="lg:ml-64 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display font-bold text-3xl text-foreground">
              Staff Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your team members and their schedules
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-colors brand-glow-sm"
          >
            <Plus className="w-5 h-5" />
            Add Staff
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bento-card">
            <p className="text-sm text-muted-foreground mb-1">Total Staff</p>
            <p className="text-3xl font-bold text-foreground">{staff.length}</p>
          </div>
          <div className="bento-card">
            <p className="text-sm text-muted-foreground mb-1">Active Today</p>
            <p className="text-3xl font-bold text-brand">
              {staff.filter((s) => s.status === "active").length}
            </p>
          </div>
          <div className="bento-card">
            <p className="text-sm text-muted-foreground mb-1">
              Avg. Team Rating
            </p>
            <p className="text-3xl font-bold text-gold">
              {staff.length > 0 
                ? (staff.reduce((acc, s) => acc + s.rating, 0) / staff.length).toFixed(1)
                : "N/A"
              }
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map((member) => (
            <div
              key={member.id}
              className="bento-card relative group"
            >
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openServicesModal(member)}
                    title="Manage services this barber provides"
                    className="p-2 rounded-lg bg-surface-elevated hover:bg-brand/20 hover:text-brand transition-colors"
                  >
                    <Scissors className="w-4 h-4" />
                  </button>
                  <Link
                    href={`/partner/dashboard/schedule?staffId=${member.id}`}
                    className="p-2 rounded-lg bg-surface-elevated hover:bg-brand/20 hover:text-brand transition-colors"
                  >
                    <Calendar className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => handleDeleteStaff(member.id)}
                    className="p-2 rounded-lg bg-surface-elevated hover:bg-destructive/20 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 mb-4">
                <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-border-solid">
                  <Image
                    src={member.avatar}
                    alt={member.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    {member.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{member.role}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="w-4 h-4 text-gold fill-gold" />
                    <span className="text-sm font-medium text-foreground">
                      {member.rating}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => toggleStatus(member)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                    member.status === "active"
                      ? "bg-brand/10 text-brand hover:bg-brand/20"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {member.status === "active" ? "Working" : "Off Today"}
                </button>
                {member.status === "active" && (
                  <span className="text-sm text-muted-foreground">
                    Active member
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1 mb-4">
                {member.specialties.map((spec) => (
                  <span
                    key={spec}
                    className="px-2 py-1 rounded-md bg-surface-elevated text-xs text-muted-foreground"
                  >
                    {spec}
                  </span>
                ))}
              </div>

              <div className="text-sm text-muted-foreground space-y-1 border-t border-border-solid pt-4">
                <p className="truncate">{member.email}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
          />
          <div className="relative w-full max-w-md bg-surface border border-border-solid rounded-2xl p-6 shadow-xl">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="font-display font-bold text-xl text-foreground mb-6">
              Add New Staff Member
            </h2>

            <form onSubmit={handleAddStaff} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    value={newStaff.name}
                    onChange={(e) =>
                      setNewStaff({ ...newStaff, name: e.target.value })
                    }
                    placeholder="John Smith"
                    className="w-full pl-12 pr-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Role
                </label>
                <input
                  type="text"
                  value={newStaff.role}
                  onChange={(e) =>
                    setNewStaff({ ...newStaff, role: e.target.value })
                  }
                  placeholder="e.g., Senior Barber"
                  className="w-full px-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="email"
                    value={newStaff.email}
                    onChange={(e) =>
                      setNewStaff({ ...newStaff, email: e.target.value })
                    }
                    placeholder="john@salon.com"
                    className="w-full pl-12 pr-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Phone
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="tel"
                    value={newStaff.phone}
                    onChange={(e) =>
                      setNewStaff({ ...newStaff, phone: e.target.value })
                    }
                    placeholder="(555) 123-4567"
                    className="w-full pl-12 pr-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Specialties
                </label>
                <input
                  type="text"
                  value={newStaff.specialties}
                  onChange={(e) =>
                    setNewStaff({ ...newStaff, specialties: e.target.value })
                  }
                  placeholder="Fades, Beard Care, Color"
                  className="w-full px-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Separate with commas
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-colors brand-glow-sm"
              >
                Add Staff Member
              </button>
            </form>
          </div>
        </div>
      )}

      {svcModalStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => !svcSaving && setSvcModalStaff(null)}
          />
          <div className="relative w-full max-w-lg bg-surface border border-border-solid rounded-2xl p-6 shadow-xl max-h-[85vh] flex flex-col">
            <button
              onClick={() => !svcSaving && setSvcModalStaff(null)}
              className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="font-display font-bold text-xl text-foreground mb-1">
              Services — {svcModalStaff.name}
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              Choose which services this barber performs. Leave price empty to use
              the service's base price, or set a custom price for this barber.
            </p>

            {svcLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-10 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading services...
              </div>
            ) : salonServices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">
                No active services in this salon yet. Add services first in
                "Services &amp; Pricing".
              </p>
            ) : (
              <div className="space-y-2 overflow-y-auto pr-1">
                {salonServices.map((s) => {
                  const row = svcRows[s.id]
                  if (!row) return null
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border transition-colors",
                        row.assigned
                          ? "border-brand/30 bg-brand/5"
                          : "border-border-solid bg-surface-elevated/30"
                      )}
                    >
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={row.assigned}
                          onChange={() => setSvcRow(s.id, { assigned: !row.assigned })}
                        />
                        <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
                      </label>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Base: {s.price} ₸ · {s.duration} min
                        </p>
                      </div>
                      <div className="relative w-28 shrink-0">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="decimal"
                          disabled={!row.assigned}
                          value={row.price}
                          onChange={(e) => setSvcRow(s.id, { price: e.target.value })}
                          placeholder={`${s.price}`}
                          className="w-full pl-3 pr-7 py-2 rounded-lg bg-surface-elevated border border-border-solid text-foreground text-sm focus:outline-none focus:border-brand disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">₸</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex items-center gap-3 pt-5 mt-1 border-t border-border-solid">
              <button
                onClick={() => setSvcModalStaff(null)}
                disabled={svcSaving}
                className="px-5 py-2.5 rounded-xl font-medium text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveServices}
                disabled={svcSaving || svcLoading || salonServices.length === 0}
                className="flex-1 py-2.5 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-colors brand-glow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {svcSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                Save Services
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
