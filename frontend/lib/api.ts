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

/** Build an Error annotated with HTTP status + (optional) auth code, for callers to branch on. */
async function buildHttpError(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => null)
  let message: string
  try {
    message = parseApiError(body, `${fallback} (HTTP ${res.status})`)
  } catch (structured) {
    // parseApiError throws for {detail: {code, message}} payloads — surface those directly
    return structured as Error
  }
  const err = new Error(message) as any
  err.status = res.status
  if (res.status === 401) err.code = "UNAUTHORIZED"
  if (res.status === 403) err.code = "FORBIDDEN"
  return err
}

export const getApiBaseUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL
  // Prod (Vercel): NEXT_PUBLIC_API_URL points at the Render backend — return as-is.
  // Local dev: env unset OR points at localhost. In a browser we used to
  // synthesize `${origin}:8000`, but on Vercel that produces e.g.
  // `https://barberhub.vercel.app:8000` which doesn't route anywhere. Only
  // apply the synthesized URL when actually loaded on localhost.
  if (envUrl && !envUrl.includes("localhost")) return envUrl
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return `${window.location.protocol}//${window.location.hostname}:8000`
  }
  return envUrl || "http://localhost:8000"
}

const API_BASE_URL = getApiBaseUrl()
if (process.env.NODE_ENV !== "production") {
  console.log("[API] Base URL configured as:", API_BASE_URL)
}

/* ──────────────────────────────────────────────────────────────────────────
 * Auth layer
 *
 * Access token: short-lived (30 min), held in JS (localStorage for reload
 * persistence). Refresh token: long-lived, in an httpOnly cookie the browser
 * sends automatically to /users/refresh — invisible to JS, so XSS can steal at
 * most a 30-min access token, not a 30-day session.
 *
 * apiFetch() transparently retries once on 401 by calling /users/refresh.
 * Concurrent 401s share a single in-flight refresh (no thundering herd).
 * ────────────────────────────────────────────────────────────────────────── */

let inMemoryToken: string | null = null

function getToken(): string | null {
  if (inMemoryToken) return inMemoryToken
  if (typeof window !== "undefined") return localStorage.getItem("token")
  return null
}

function setToken(t: string) {
  inMemoryToken = t
  if (typeof window !== "undefined") localStorage.setItem("token", t)
}

function clearToken() {
  inMemoryToken = null
  if (typeof window !== "undefined") localStorage.removeItem("token")
}

let refreshPromise: Promise<string | null> | null = null

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/users/refresh`, {
      method: "POST",
      credentials: "include", // send the httpOnly refresh cookie
    })
      .then(async (r) => {
        if (!r.ok) return null
        const d = await r.json()
        setToken(d.access_token)
        return d.access_token as string
      })
      .catch(() => null)
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

interface ApiFetchOpts { auth?: boolean; token?: string | null }

async function apiFetch(
  path: string,
  init: RequestInit = {},
  opts: ApiFetchOpts = {},
): Promise<Response> {
  const doFetch = (bearer: string | null): Promise<Response> => {
    const headers = new Headers(init.headers || {})
    if (opts.auth && bearer) headers.set("Authorization", `Bearer ${bearer}`)
    // credentials: "include" is required cross-origin so the browser sends the
    // httpOnly refresh cookie on every call — without it, the 401→/refresh
    // path can't get a fresh token and the user is silently logged out on
    // every cold-start once the 30-min access token expires.
    return fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...init,
      headers,
    })
  }

  const bearer = opts.auth ? (opts.token ?? getToken()) : null
  let res = await doFetch(bearer)

  if (res.status === 401 && opts.auth) {
    const fresh = await refreshAccessToken()
    if (fresh) {
      res = await doFetch(fresh)
    } else {
      clearToken() // refresh failed → genuinely logged out
    }
  }
  return res
}

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
  timezone: string
  phone: string
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
  // IANA tz — REQUIRED for correct salon-local↔UTC booking conversion.
  // Dropping it made the booking page send picked time as UTC (5h shift).
  timezone: data.timezone || "Asia/Almaty",
  phone: data.phone || "",
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
    const res = await apiFetch(`/bookings/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookingData),
    }, { auth: true, token })
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
      credentials: "include", // store the refresh cookie
      body: JSON.stringify(credentials)
    })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(parseApiError(body, "Login failed"))
    }
    const data = await res.json()
    setToken(data.access_token)
    return data
  },

  async loginWithGoogle(idToken: string) {
    const res = await fetch(`${API_BASE_URL}/users/oauth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // store the refresh cookie
      body: JSON.stringify({ id_token: idToken })
    })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(parseApiError(body, "Google sign-in failed"))
    }
    const data = await res.json()
    setToken(data.access_token)
    return data
  },

  /** Manually exchange the refresh cookie for a new access token. */
  async refresh(): Promise<string | null> {
    return refreshAccessToken()
  },

  /** Revoke the session server-side (blocks tokens, clears refresh cookie). */
  async logout() {
    try {
      await apiFetch(`/users/logout`, {
        method: "POST",
        credentials: "include",
      }, { auth: true })
    } catch {
      // best-effort — clear local state regardless
    }
    clearToken()
    if (typeof window !== "undefined") localStorage.removeItem("user")
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
    const url = `/salons/`
    let res: Response
    try {
      res = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salonData)
      }, { auth: true, token })
    } catch (networkErr: any) {
      console.error("[API] Salon creation network error:", networkErr.message || "Connection refused/Timeout")
      throw new Error(`Failed to fetch: ${networkErr.message || "Connection refused/Timeout"}`)
    }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const errBody = await res.json()
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
    return await res.json()
  },

  async getSalonByOwnerId(ownerId: string, token?: string) {
    const res = await apiFetch(`/salons/owner/${ownerId}`, {}, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, `Failed to fetch owner salon`)
    const data = await res.json()
    return transformSalon(data)
  },

  /** Raw (untransformed) salon for the owner — needed for the Salon Profile
   *  editor which works with backend fields (operating_hours, phone, etc.). */
  async getSalonRawByOwnerId(ownerId: string, token?: string) {
    const res = await apiFetch(`/salons/owner/${ownerId}`, {}, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, `Failed to fetch owner salon`)
    return await res.json()
  },

  async updateSalon(salonId: string, data: any, token: string) {
    const res = await apiFetch(`/salons/${salonId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }, { auth: true, token })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(parseApiError(body, "Failed to update salon"))
    }
    return await res.json()
  },

  async getSalonStats(salonId: string, token: string) {
    const res = await apiFetch(`/salons/${salonId}/stats`, {}, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to fetch stats")
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
    const res = await apiFetch(`/reviews/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reviewData)
    }, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to create review")
    return await res.json()
  },

  async getBookingsForClient(clientId: string, token: string) {
    const res = await apiFetch(`/bookings/client/${clientId}`, {}, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to fetch client bookings")
    return await res.json()
  },

  async getBookingsBySalon(salonId: string, token: string) {
    const res = await apiFetch(`/bookings/salon/${salonId}`, {}, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to fetch salon bookings")
    return await res.json()
  },

  async getBookingsForStaff(staffId: string, token: string) {
    const res = await apiFetch(`/bookings/staff/${staffId}`, {}, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to fetch staff bookings")
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
    if (!res.ok) throw await buildHttpError(res, "Failed to send reset link")
    return await res.json()
  },

  async evaluateBarber(
    payload: {
      years_experience_cat: string
      skills: string[]
      education_count: number
    },
    token: string,
  ) {
    // Backend `/ml/evaluate-barber` is auth-gated (get_current_user). Route
    // through apiFetch so the Bearer token + refresh-cookie retry path apply
    // — a raw fetch() here was the cause of every "evaluate" click 401ing.
    const res = await apiFetch(
      "/ml/evaluate-barber",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      { auth: true, token },
    )
    if (!res.ok) throw await buildHttpError(res, "Prediction failed")
    return await res.json()
  },

  async resendVerification(email: string) {
    const res = await fetch(`${API_BASE_URL}/users/resend-verification`, {
      method: "POST",
      credentials: "include",  // parity with apiFetch convention
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    })
    if (!res.ok) throw await buildHttpError(res, "Could not resend verification email")
    return (await res.json()) as { message: string }
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

  // ── Staff ↔ Service assignments (which barber performs which service) ──

  /** Services a barber provides: [{ staff_id, service_id, custom_price }]. */
  async getStaffServices(staffId: string) {
    const res = await fetch(`${API_BASE_URL}/staff-services/staff/${staffId}`)
    if (!res.ok) throw new Error("Failed to fetch staff services")
    return await res.json()
  },

  /** Assign a service to a barber (upsert: also updates custom_price if the
   *  link already exists). custom_price null → use the service base price. */
  async assignStaffService(staffId: string, serviceId: string, customPrice: number | null, token: string) {
    const res = await apiFetch(`/staff-services/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: staffId, service_id: serviceId, custom_price: customPrice }),
    }, { auth: true, token })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(parseApiError(body, "Failed to assign service"))
    }
    return await res.json()
  },

  async removeStaffService(staffId: string, serviceId: string, token: string) {
    const res = await apiFetch(`/staff-services/${staffId}/${serviceId}`, {
      method: "DELETE",
    }, { auth: true, token })
    if (!res.ok && res.status !== 404) {
      const body = await res.json().catch(() => null)
      throw new Error(parseApiError(body, "Failed to remove service"))
    }
    return true
  },

  async createService(serviceData: any, token: string) {
    const res = await apiFetch(`/services/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serviceData)
    }, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to create service")
    return await res.json()
  },

  async createStaff(staffData: any, token: string) {
    const res = await apiFetch(`/staff/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(staffData)
    }, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to create staff member")
    return await res.json()
  },

  async createSchedule(scheduleData: any, token: string) {
    const res = await apiFetch(`/schedules/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scheduleData)
    }, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to create schedule")
    return await res.json()
  },

  async uploadSalonImage(salonId: string, file: File, token: string) {
    const formData = new FormData()
    formData.append("file", file)

    const res = await apiFetch(`/salons/${salonId}/image`, {
      method: "POST",
      body: formData
    }, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to upload image")
    return await res.json()
  },

  async getMe(token: string) {
    const res = await apiFetch(`/users/me`, {}, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to fetch user info")
    return await res.json()
  },

  async updateStaff(staffId: string, staffData: any, token: string) {
    const res = await apiFetch(`/staff/${staffId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(staffData)
    }, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to update staff member")
    return await res.json()
  },

  async deleteStaff(staffId: string, token: string) {
    const res = await apiFetch(`/staff/${staffId}`, {
      method: "DELETE"
    }, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to delete staff member")
    return true
  },

  async updateBookingStatus(bookingId: string, status: string, token: string) {
    const res = await apiFetch(`/bookings/${bookingId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    }, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to update booking status")
    return await res.json()
  },

  async updateService(serviceId: string, serviceData: any, token: string) {
    const res = await apiFetch(`/services/${serviceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serviceData)
    }, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to update service")
    return await res.json()
  },

  async deleteService(serviceId: string, token: string) {
    const res = await apiFetch(`/services/${serviceId}`, {
      method: "DELETE"
    }, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to delete service")
    return true
  },

  async getSchedulesByStaffId(staffId: string) {
    const res = await fetch(`${API_BASE_URL}/schedules/staff/${staffId}`)
    if (!res.ok) throw new Error("Failed to fetch schedules")
    return await res.json()
  },

  async getAvailableSlots(staffId: string, date: string, serviceId: string): Promise<string[]> {
    const res = await fetch(
      `${API_BASE_URL}/schedules/staff/${staffId}/available-slots?date=${date}&service_id=${serviceId}`
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.slots ?? []
  },

  async updateSchedule(scheduleId: string, scheduleData: any, token: string) {
    const res = await apiFetch(`/schedules/${scheduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scheduleData)
    }, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to update schedule")
    return await res.json()
  },

  async deleteSchedule(scheduleId: string, token: string) {
    const res = await apiFetch(`/schedules/${scheduleId}`, {
      method: "DELETE"
    }, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to delete schedule")
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

    const res = await apiFetch(`/staff/${staffId}/image`, {
      method: "POST",
      body: formData
    }, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to upload staff avatar")
    return await res.json()
  },

  async getMyStats(token: string) {
    const res = await apiFetch(`/users/me/stats`, {}, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to fetch user stats")
    return await res.json()
  },

  async uploadUserAvatar(file: File, token: string) {
    const formData = new FormData()
    formData.append("file", file)

    const res = await apiFetch(`/users/me/avatar`, {
      method: "POST",
      body: formData
    }, { auth: true, token })
    if (!res.ok) throw await buildHttpError(res, "Failed to upload user avatar")
    return await res.json()
  },

  async updateMe(data: { full_name?: string; phone?: string }, token: string) {
    const res = await apiFetch(`/users/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }, { auth: true, token })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(parseApiError(body, "Failed to update profile"))
    }
    return await res.json()
  }
}
