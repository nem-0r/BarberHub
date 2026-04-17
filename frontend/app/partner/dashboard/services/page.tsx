"use client"

import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Loader2, Plus, Clock, Edit, Trash2, X, DollarSign } from "lucide-react"
import { PartnerSidebar } from "@/components/partner/partner-sidebar"

interface ServiceItem {
  id: string
  name: string
  description: string
  price: number
  duration: number
  category: string
  isActive: boolean
}

const initialServices: ServiceItem[] = [
  {
    id: "1",
    name: "Signature Fade",
    description: "Precision fade with hot towel finish",
    price: 55,
    duration: 45,
    category: "Haircuts",
    isActive: true,
  },
  {
    id: "2",
    name: "Beard Sculpting",
    description: "Shape and define your beard",
    price: 35,
    duration: 30,
    category: "Beard",
    isActive: true,
  },
  {
    id: "3",
    name: "The Full Experience",
    description: "Haircut + beard + hot towel shave",
    price: 95,
    duration: 75,
    category: "Packages",
    isActive: true,
  },
  {
    id: "4",
    name: "Kids Cut",
    description: "Haircut for children under 12",
    price: 25,
    duration: 25,
    category: "Haircuts",
    isActive: true,
  },
  {
    id: "5",
    name: "Hot Towel Shave",
    description: "Classic straight razor shave",
    price: 40,
    duration: 35,
    category: "Shaves",
    isActive: false,
  },
]

const categories = ["All", "Haircuts", "Beard", "Shaves", "Packages"]

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [salon, setSalon] = useState<any>(null)

  const [activeCategory, setActiveCategory] = useState("All")
  const [showModal, setShowModal] = useState(false)
  const [editingService, setEditingService] = useState<ServiceItem | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    duration: "",
    category: "Haircuts",
  })

  useEffect(() => {
    async function loadServices() {
      try {
        const userStr = localStorage.getItem("user")
        if (!userStr) {
          window.location.href = "/login"
          return
        }
        const user = JSON.parse(userStr)
        // Only owner / admin can manage the salon's service catalogue
        if (user.role !== "owner" && user.role !== "admin") {
          window.location.href = "/partner/dashboard"
          return
        }
        const salonData = await api.getSalonByOwnerId(user.id)
        setSalon(salonData)
        
        const servicesData = await api.getServicesBySalonId(salonData.id)
        setServices(servicesData)
      } catch (err: any) {
        console.error(err)
        setError(err.message || "Failed to load services")
      } finally {
        setLoading(false)
      }
    }
    loadServices()
  }, [])

  const filteredServices =
    activeCategory === "All"
      ? services
      : services.filter((s) => s.category === activeCategory)

  function openAddModal() {
    setEditingService(null)
    setFormData({
      name: "",
      description: "",
      price: "",
      duration: "",
      category: "Haircuts",
    })
    setShowModal(true)
  }

  function openEditModal(service: ServiceItem) {
    setEditingService(service)
    setFormData({
      name: service.name,
      description: service.description,
      price: service.price.toString(),
      duration: service.duration.toString(),
      category: service.category,
    })
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const token = localStorage.getItem("token")
      if (!token) throw new Error("No token found")

      const serviceData = {
        name: formData.name,
        description: formData.description,
        base_price: parseFloat(formData.price),
        duration_minutes: parseInt(formData.duration),
        category: formData.category,
        salon_id: salon.id,
        is_active: editingService ? editingService.isActive : true
      }

      if (editingService) {
        await api.updateService(editingService.id, serviceData, token)
      } else {
        await api.createService(serviceData, token)
      }

      // Refresh list
      const data = await api.getServicesBySalonId(salon.id)
      setServices(data)
      setShowModal(false)
    } catch (err: any) {
      alert(err.message || "Operation failed")
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this service?")) return
    
    try {
      const token = localStorage.getItem("token")
      if (!token) throw new Error("No token found")
      
      await api.deleteService(id, token)
      setServices(services.filter((s) => s.id !== id))
    } catch (err: any) {
      alert("Failed to delete service")
    }
  }

  async function toggleActive(service: ServiceItem) {
    try {
      const token = localStorage.getItem("token")
      if (!token) throw new Error("No token found")

      await api.updateService(service.id, { is_active: !service.isActive }, token)
      
      setServices(services.map(s => 
        s.id === service.id ? { ...s, isActive: !s.isActive } : s
      ))
    } catch (err: any) {
      alert("Failed to update status")
    }
  }

  if (loading && !salon) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-muted-foreground">Loading your services...</p>
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
              Services & Pricing
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your service menu and prices
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-6 py-3 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-colors brand-glow-sm"
          >
            <Plus className="w-5 h-5" />
            Add Service
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bento-card">
            <p className="text-sm text-muted-foreground mb-1">Total Services</p>
            <p className="text-3xl font-bold text-foreground">
              {services.length}
            </p>
          </div>
          <div className="bento-card">
            <p className="text-sm text-muted-foreground mb-1">Active</p>
            <p className="text-3xl font-bold text-brand">
              {services.filter((s) => s.isActive).length}
            </p>
          </div>
          <div className="bento-card">
            <p className="text-sm text-muted-foreground mb-1">Avg. Price</p>
            <p className="text-3xl font-bold text-gold">
              $
              {services.length > 0
                ? Math.round(services.reduce((acc, s) => acc + s.price, 0) / services.length)
                : 0
              }
            </p>
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                activeCategory === cat
                  ? "bg-brand text-brand-foreground"
                  : "bg-surface-elevated text-muted-foreground hover:text-foreground"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Services Table */}
        <div className="bento-card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-solid">
                <th className="text-left text-sm font-medium text-muted-foreground p-4">
                  Service
                </th>
                <th className="text-left text-sm font-medium text-muted-foreground p-4">
                  Category
                </th>
                <th className="text-left text-sm font-medium text-muted-foreground p-4">
                  Duration
                </th>
                <th className="text-left text-sm font-medium text-muted-foreground p-4">
                  Price
                </th>
                <th className="text-left text-sm font-medium text-muted-foreground p-4">
                  Status
                </th>
                <th className="text-right text-sm font-medium text-muted-foreground p-4">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.map((service) => (
                <tr
                  key={service.id}
                  className="border-b border-border-solid last:border-0 hover:bg-surface-elevated/50 transition-colors"
                >
                  <td className="p-4">
                    <div>
                      <p className="font-semibold text-foreground">
                        {service.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {service.description}
                      </p>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 rounded-md bg-surface-elevated text-sm text-muted-foreground">
                      {service.category}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {service.duration} min
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="font-bold text-brand text-lg">
                      ${service.price}
                    </span>
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => toggleActive(service)}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                        service.isActive
                          ? "bg-brand/10 text-brand hover:bg-brand/20"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {service.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(service)}
                        className="p-2 rounded-lg bg-surface-elevated hover:bg-muted transition-colors"
                      >
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDelete(service.id)}
                        className="p-2 rounded-lg bg-surface-elevated hover:bg-destructive/20 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="relative w-full max-w-md bg-surface border border-border-solid rounded-2xl p-6 shadow-xl">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="font-display font-bold text-xl text-foreground mb-6">
              {editingService ? "Edit Service" : "Add New Service"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Service Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g., Signature Fade"
                  className="w-full px-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Brief description of the service"
                  className="w-full px-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Price ($)
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="number"
                      value={formData.price}
                      onChange={(e) =>
                        setFormData({ ...formData, price: e.target.value })
                      }
                      placeholder="45"
                      min="0"
                      className="w-full pl-12 pr-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Duration (min)
                  </label>
                  <div className="relative">
                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="number"
                      value={formData.duration}
                      onChange={(e) =>
                        setFormData({ ...formData, duration: e.target.value })
                      }
                      placeholder="30"
                      min="5"
                      className="w-full pl-12 pr-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-surface-elevated border border-border-solid rounded-xl text-foreground focus:outline-none focus:border-brand"
                >
                  {categories.filter((c) => c !== "All").map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-colors brand-glow-sm"
              >
                {editingService ? "Save Changes" : "Add Service"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
