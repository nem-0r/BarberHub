"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { PartnerSidebar } from "@/components/partner/partner-sidebar"
import { ImageUpload } from "@/components/ui/image-upload"
import { api } from "@/lib/api"
import { 
  User, 
  Mail, 
  Phone, 
  Shield, 
  Save, 
  Loader2,
  CheckCircle2,
  AlertCircle
} from "lucide-react"

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [staffRecord, setStaffRecord] = useState<any>(null)
  const [formData, setFormData] = useState({ full_name: "", phone: "" })

  useEffect(() => {
    async function loadProfile() {
      try {
        const token = localStorage.getItem("token")
        if (!token) {
          router.replace("/login")
          return
        }

        const userData = await api.getMe(token)
        setUser(userData)
        setFormData({ full_name: userData.full_name || "", phone: userData.phone || "" })

        if (userData.role === "staff") {
          const staff = await api.getStaffByUserId(userData.id)
          setStaffRecord(staff)
        }
      } catch (err: any) {
        // 401 from /users/me means token is revoked / user deleted — push to
        // login instead of silently showing an empty profile form.
        if (err?.code === "UNAUTHORIZED" || err?.status === 401) {
          localStorage.removeItem("token")
          localStorage.removeItem("user")
          router.replace("/login")
          return
        }
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [router])

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const token = localStorage.getItem("token")
      if (!token) throw new Error("Not authenticated")
      const updated = await api.updateMe(formData, token)
      setUser(updated)
      localStorage.setItem("user", JSON.stringify(updated))
      setStatus({ type: 'success', message: 'Profile updated successfully!' })
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to save changes' })
    } finally {
      setSaving(false)
    }
  }

  const handleResetPassword = async () => {
    if (!user?.email) return
    try {
      await api.forgotPassword(user.email)
      setStatus({ type: 'success', message: `Password reset link sent to ${user.email}` })
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to send reset link' })
    }
  }

  const handleAvatarUpload = async (file: File) => {
    try {
      const token = localStorage.getItem("token")
      if (!token) return

      // Show local preview immediately while Celery processes the upload in background
      const localPreviewUrl = URL.createObjectURL(file)
      setUser((prev: any) => prev ? { ...prev, avatar_url: localPreviewUrl } : prev)

      await api.uploadUserAvatar(file, token)
      setStatus({ type: 'success', message: 'Avatar upload started! It will update in a few moments.' })
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to upload avatar' })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-muted-foreground">Loading your profile...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <PartnerSidebar />

      <main className="lg:ml-64 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-display font-bold text-foreground">My Profile</h1>
            <p className="text-muted-foreground mt-1">Manage your personal information and account settings</p>
          </div>

          {status && (
            <div className={cn(
              "p-4 rounded-xl mb-6 flex items-center gap-3",
              status.type === 'success' ? "bg-brand/10 text-brand" : "bg-destructive/10 text-destructive"
            )}>
              {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <p className="text-sm font-medium">{status.message}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Avatar & Identity */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bento-card text-center py-8">
                <div className="relative w-32 h-32 mx-auto mb-4">
                  <ImageUpload 
                    value={user?.avatar_url || staffRecord?.avatar}
                    onChange={handleAvatarUpload}
                    aspectRatio="square"
                    className="w-full h-full"
                  />
                </div>
                <h3 className="text-xl font-bold text-foreground">{user?.full_name}</h3>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand/10 text-brand rounded-full text-xs font-bold uppercase tracking-wider mt-2">
                  <Shield className="w-3 h-3" />
                  {user?.role}
                </div>
              </div>

              <div className="bento-card space-y-4">
                <h4 className="font-bold text-foreground text-sm uppercase tracking-wider">Account Status</h4>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Email Verified</span>
                  <span className="text-brand font-bold">{user?.is_verified ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Member Since</span>
                  <span className="text-foreground">{new Date(user?.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            {/* Right: Settings Form */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bento-card">
                <h3 className="text-xl font-bold text-foreground mb-6">Personal Information</h3>
                <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSave() }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground ml-1">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <input
                          type="text"
                          value={formData.full_name}
                          onChange={(e) => setFormData(f => ({ ...f, full_name: e.target.value }))}
                          className="w-full pl-12 pr-4 py-3 bg-sidebar-accent border border-sidebar-border rounded-xl text-foreground focus:outline-none focus:border-brand transition-all"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground ml-1">Phone Number</label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData(f => ({ ...f, phone: e.target.value }))}
                          className="w-full pl-12 pr-4 py-3 bg-sidebar-accent border border-sidebar-border rounded-xl text-foreground focus:outline-none focus:border-brand transition-all"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <input
                        type="email"
                        value={user?.email || ""}
                        disabled
                        className="w-full pl-12 pr-4 py-3 bg-sidebar-accent border border-sidebar-border rounded-xl text-muted-foreground cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {user?.role === "staff" && staffRecord && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground ml-1">Position</label>
                      <input
                        type="text"
                        value={staffRecord.role}
                        disabled
                        className="w-full px-4 py-3 bg-sidebar-accent border border-sidebar-border rounded-xl text-muted-foreground cursor-not-allowed"
                      />
                    </div>
                  )}

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full sm:w-auto px-8 py-3 bg-brand text-brand-foreground rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-brand/90 transition-all shadow-lg shadow-brand/20 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>

              <div className="bento-card border-destructive/20 bg-destructive/5">
                <h3 className="text-lg font-bold text-foreground mb-1">Security</h3>
                <p className="text-sm text-muted-foreground mb-6">Request a password reset link to your email</p>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="px-6 py-2 border border-destructive/30 text-destructive rounded-xl text-sm font-bold hover:bg-destructive/10 transition-all"
                >
                  Reset Password
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ")
}
