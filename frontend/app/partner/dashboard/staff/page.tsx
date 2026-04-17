"use client"

import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Loader2, Plus, Star, Edit, Trash2, User, Mail, Phone, X, Calendar } from "lucide-react"
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
          window.location.href = "/login"
          return
        }
        const user = JSON.parse(userStr)
        // Only owner / admin can manage the salon's staff list
        if (user.role !== "owner" && user.role !== "admin") {
          window.location.href = "/partner/dashboard"
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
      
      // Refresh list
      const staffData = await api.getBarbersBySalonId(salon.id)
      setStaff(staffData)
      setShowAddModal(false)
      setNewStaff({ name: "", role: "", email: "", phone: "", specialties: "" })
    } catch (err: any) {
      alert(err.message || "Failed to add staff")
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
      alert(err.message || "Failed to delete staff")
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
      alert("Failed to update status")
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

      <main className="ml-64 p-8">
        {/* Header */}
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

        {/* Stats */}
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

        {/* Staff Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map((member) => (
            <div
              key={member.id}
              className="bento-card relative group"
            >
              {/* Actions Menu */}
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1">
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

              {/* Profile */}
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

              {/* Status */}
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

              {/* Specialties */}
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

              {/* Contact */}
              <div className="text-sm text-muted-foreground space-y-1 border-t border-border-solid pt-4">
                <p className="truncate">{member.email}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Add Staff Modal */}
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
    </div>
  )
}
