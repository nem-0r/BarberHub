/** Parse FastAPI/Pydantic error responses into a human-readable string. */
function parseApiError(body: any, fallback = "Request failed"): string {
  if (!body) return fallback
  const detail = body.detail
  if (!detail) return body.message || fallback
  // Pydantic v2 validation errors → array of {loc, msg, type}
  if (Array.isArray(detail)) {
    return detail.map((e: any) => {
      const loc = Array.isArray(e.loc) ? e.loc.filter((l: any) => l !== "body").join(".") : ""
      return loc ? `${loc}: ${e.msg}` : e.msg
    }).join("; ")
  }
  // Structured object with code (e.g. EMAIL_NOT_VERIFIED)
  if (typeof detail === "object" && detail.code) {
    const err = new Error(detail.message || fallback) as any
    err.code = detail.code
    throw err   // re-throw so callers can inspect .code
  }
  return String(detail)
}

const getApiBaseUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL
  if (typeof window !== "undefined") {
    if (!envUrl || envUrl.includes("localhost")) {
      // If we are in the browser and API points to localhost,
      // try to use the current host but on port 8000
      return `${window.location.protocol}//${window.location.hostname}:8000`
    }
  }
  return envUrl || "http://localhost:8000"
}

const API_BASE_URL = getApiBaseUrl()
console.log("[API] Base URL configured as:", API_BASE_URL)

export interface Salon {
  id: string
  name: string
  address: string
  city: string
  coverImage: string
  rating: number
  reviewCount: number
  priceRange: string
  isOpen: boolean
  openUntil: string
  tags: string[]
  description: string
}

export interface Barber {
  id: string
  name: string
  avatar: string
  role: string
  salonId: string
  rating: number
  specialties: string[]
  yearsExperience: number
}

export interface Service {
  id: string
  name: string
  description: string
  price: number
  duration: number
  salonId: string
  category: string
}

export interface Review {
  id: string
  author: string
  avatar: string
  rating: number
  date: string
  comment: string
}

export const CITIES = ["All Cities", "Almaty", "Astana", "Shymkent", "Karaganda", "Aktobe", "Taraz", "Pavlodar", "Ust-Kamenogorsk", "Semey", "Atyrau", "Kostanay", "Kyzylorda", "Aktau", "Uralsk", "Petropavl", "Turkistan"]

// Transformers to map Backend (snake_case) to Frontend (camelCase)
export const transformSalon = (data: any) => ({
  id: data.id,
  name: data.name,
  address: data.address,
  city: data.city || "Not specified",
  coverImage: data.image_url || "/images/placeholder-salon.jpg",
  rating: data.rating || 5.0,
  reviewCount: data.review_count || 0,
  priceRange: data.price_range || "$$",
  isOpen: data.is_open ?? true,
  openUntil: data.open_until || "9:00 PM",
  tags: data.tags || [],
  description: data.description || "",
})

export const transformBarber = (data: any) => ({
  id: data.id,
  user_id: data.user_id,
  name: data.full_name || "Unknown Barber", // Note: Name comes from User join
  avatar: data.image_url || data.avatar_url || "/images/placeholder-avatar.jpg",
  role: data.position || "Barber",
  salonId: data.salon_id,
  rating: data.rating || 5.0,
  specialties: data.specialties || [],
  yearsExperience: data.years_experience || 0,
  // Map backend's is_active (bool) to the status field used by StaffPage
  status: data.is_active !== false ? "active" : "off",
  email: data.email || "",
  phone: data.phone || "",
  bookingsToday: data.bookings_today || 0,
})

export const transformService = (data: any) => ({
  id: data.id,
  name: data.name,
  description: data.description || "",
  price: parseFloat(data.base_price),
  duration: data.duration_minutes,
  salonId: data.salon_id,
  category: data.category || "General",
  isActive: data.is_active ?? true,
})

// API Methods
export const api = {
  async getSalons() {
    const res = await fetch(`${API_BASE_URL}/salons/`)
    if (!res.ok) throw new Error("Failed to fetch salons")
    const data = await res.json()
    return data.map(transformSalon)
  },

  async getSalonById(id: string) {
    const res = await fetch(`${API_BASE_URL}/salons/${id}`)
    if (!res.ok) throw new Error("Failed to fetch salon")
    const data = await res.json()
    return transformSalon(data)
  },

  async getBarbersBySalonId(salonId: string) {
    const res = await fetch(`${API_BASE_URL}/staff/salon/${salonId}`)
    if (!res.ok) throw new Error("Failed to fetch barbers")
    const data = await res.json()
    return data.map(transformBarber)
  },

  async getServicesBySalonId(salonId: string) {
    const res = await fetch(`${API_BASE_URL}/services/salon/${salonId}`)
    if (!res.ok) throw new Error("Failed to fetch services")
    const data = await res.json()
    return data.map(transformService)
  },

  async createBooking(bookingData: any, token: string) {
    const res = await fetch(`${API_BASE_URL}/bookings/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(bookingData)
    })
    if (res.status === 401) {
      const err = new Error("Session expired. Please log in again.") as any
      err.code = "UNAUTHORIZED"
      throw err
    }
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.detail || error.message || "Failed to create booking")
    }
    return await res.json()
  },

  async login(credentials: any) {
    const res = await fetch(`${API_BASE_URL}/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials)
    })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(parseApiError(body, "Login failed"))
    }
    return await res.json()
  },

  async register(userData: any) {
    const res = await fetch(`${API_BASE_URL}/users/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData)
    })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(parseApiError(body, "Registration failed"))
    }
    return await res.json()
  },

  async createSalon(salonData: any, token: string) {
    const url = `${API_BASE_URL}/salons/`
    console.log("[API] Attempting to create salon at:", url, salonData)
    let res: Response
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(salonData)
      })
    } catch (networkErr: any) {
      console.error("[API] Salon creation network error:", networkErr)
      throw new Error(`Failed to fetch: ${networkErr.message || "Connection refused/Timeout"}`)
    }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const errBody = await res.json()
        console.error("[API] Salon creation failed with branch status:", res.status, errBody)
        // Pydantic returns detail as array of objects
        if (Array.isArray(errBody.detail)) {
          detail = errBody.detail.map((e: any) => `${e.loc?.join('.')}: ${e.msg}`).join('; ')
        } else if (typeof errBody.detail === 'string') {
          detail = errBody.detail
        } else if (errBody.message) {
          detail = errBody.message
        } else {
          detail = JSON.stringify(errBody)
        }
      } catch {
        // Response body is not JSON
        detail = `HTTP ${res.status}: ${res.statusText}`
      }
      throw new Error(detail)
    }
    const result = await res.json()
    console.log("[API] Salon created successfully:", result)
    return result
  },

  async getSalonByOwnerId(ownerId: string) {
    const res = await fetch(`${API_BASE_URL}/salons/owner/${ownerId}`)
    if (!res.ok) {
      throw new Error(`Failed to fetch owner salon: ${res.status}`)
    }
    const data = await res.json()
    return transformSalon(data)
  },

  async getSalonStats(salonId: string, token: string) {
    const res = await fetch(`${API_BASE_URL}/salons/${salonId}/stats`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
    if (!res.ok) {
      throw new Error(`Failed to fetch stats: ${res.status}`)
    }
    return await res.json()
  },

  async getReviews(salonId: string) {
    const res = await fetch(`${API_BASE_URL}/reviews/salon/${salonId}`)
    if (!res.ok) throw new Error("Failed to fetch reviews")
    const data = await res.json()
    return data.map((review: any) => ({
      id: review.id,
      author: "Verified Client", // We could join with user name in BE
      avatar: "/images/placeholder-avatar.jpg",
      rating: review.rating,
      comment: review.comment,
      date: new Date(review.created_at).toLocaleDateString(),
    }))
  },

  async createReview(reviewData: any, token: string) {
    const res = await fetch(`${API_BASE_URL}/reviews/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(reviewData)
    })
    if (!res.ok) throw new Error("Failed to create review")
    return await res.json()
  },

  async getBookingsForClient(clientId: string, token: string) {
    const res = await fetch(`${API_BASE_URL}/bookings/client/${clientId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
    if (!res.ok) throw new Error("Failed to fetch client bookings")
    return await res.json()
  },

  async getBookingsBySalon(salonId: string, token: string) {
    const res = await fetch(`${API_BASE_URL}/bookings/salon/${salonId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
    if (!res.ok) throw new Error("Failed to fetch salon bookings")
    return await res.json()
  },

  async getBookingsForStaff(staffId: string, token: string) {
    const res = await fetch(`${API_BASE_URL}/bookings/staff/${staffId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
    if (!res.ok) throw new Error("Failed to fetch staff bookings")
    return await res.json()
  },

  async verifyEmail(token: string) {
    const res = await fetch(`${API_BASE_URL}/users/verify/${token}`)
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.detail || "Verification failed")
    }
    return await res.json()
  },

  async forgotPassword(email: string) {
    const res = await fetch(`${API_BASE_URL}/users/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    })
    if (!res.ok) throw new Error("Failed to send reset link")
    return await res.json()
  },

  async resetPassword(token: string, newPassword: string) {
    const res = await fetch(`${API_BASE_URL}/users/reset-password/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: newPassword })
    })
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.detail || "Reset failed")
    }
    return await res.json()
  },

  async createService(serviceData: any, token: string) {
    const res = await fetch(`${API_BASE_URL}/services/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(serviceData)
    })
    if (!res.ok) throw new Error("Failed to create service")
    return await res.json()
  },

  async createStaff(staffData: any, token: string) {
    const res = await fetch(`${API_BASE_URL}/staff/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(staffData)
    })
    if (!res.ok) throw new Error("Failed to create staff member")
    return await res.json()
  },

  async createSchedule(scheduleData: any, token: string) {
    const res = await fetch(`${API_BASE_URL}/schedules/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(scheduleData)
    })
    if (!res.ok) throw new Error("Failed to create schedule")
    return await res.json()
  },

  async uploadSalonImage(salonId: string, file: File, token: string) {
    const formData = new FormData()
    formData.append("file", file)
    
    const res = await fetch(`${API_BASE_URL}/salons/${salonId}/image`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`
      },
      body: formData
    })
    if (!res.ok) throw new Error("Failed to upload image")
    return await res.json()
  },

  async getMe(token: string) {
    const res = await fetch(`${API_BASE_URL}/users/me`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
    if (!res.ok) throw new Error("Failed to fetch user info")
    return await res.json()
  },

  async updateStaff(staffId: string, staffData: any, token: string) {
    const res = await fetch(`${API_BASE_URL}/staff/${staffId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(staffData)
    })
    if (!res.ok) throw new Error("Failed to update staff member")
    return await res.json()
  },

  async deleteStaff(staffId: string, token: string) {
    const res = await fetch(`${API_BASE_URL}/staff/${staffId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    })
    if (!res.ok) throw new Error("Failed to delete staff member")
    return true
  },

  async updateService(serviceId: string, serviceData: any, token: string) {
    const res = await fetch(`${API_BASE_URL}/services/${serviceId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(serviceData)
    })
    if (!res.ok) throw new Error("Failed to update service")
    return await res.json()
  },

  async deleteService(serviceId: string, token: string) {
    const res = await fetch(`${API_BASE_URL}/services/${serviceId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    })
    if (!res.ok) throw new Error("Failed to delete service")
    return true
  },

  async getSchedulesByStaffId(staffId: string) {
    const res = await fetch(`${API_BASE_URL}/schedules/staff/${staffId}`)
    if (!res.ok) throw new Error("Failed to fetch schedules")
    return await res.json()
  },

  async updateSchedule(scheduleId: string, scheduleData: any, token: string) {
    const res = await fetch(`${API_BASE_URL}/schedules/${scheduleId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(scheduleData)
    })
    if (!res.ok) throw new Error("Failed to update schedule")
    return await res.json()
  },

  async deleteSchedule(scheduleId: string, token: string) {
    const res = await fetch(`${API_BASE_URL}/schedules/${scheduleId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    })
    if (!res.ok) throw new Error("Failed to delete schedule")
    return true
  },
  
  async getStaffByUserId(userId: string) {
    const res = await fetch(`${API_BASE_URL}/staff/user/${userId}`)
    if (!res.ok) {
      if (res.status === 404) return null
      throw new Error("Failed to fetch staff record")
    }
    const data = await res.json()
    return transformBarber(data)
  },

  async uploadStaffAvatar(staffId: string, file: File, token: string) {
    const formData = new FormData()
    formData.append("file", file)
    
    const res = await fetch(`${API_BASE_URL}/staff/${staffId}/image`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`
      },
      body: formData
    })
    if (!res.ok) throw new Error("Failed to upload staff avatar")
    return await res.json()
  },

  async getMyStats(token: string) {
    const res = await fetch(`${API_BASE_URL}/users/me/stats`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
    if (!res.ok) throw new Error("Failed to fetch user stats")
    return await res.json()
  },

  async uploadUserAvatar(file: File, token: string) {
    const formData = new FormData()
    formData.append("file", file)

    const res = await fetch(`${API_BASE_URL}/users/me/avatar`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`
      },
      body: formData
    })
    if (!res.ok) throw new Error("Failed to upload user avatar")
    return await res.json()
  },

  async updateMe(data: { full_name?: string; phone?: string }, token: string) {
    const res = await fetch(`${API_BASE_URL}/users/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(data)
    })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(parseApiError(body, "Failed to update profile"))
    }
    return await res.json()
  }
}
