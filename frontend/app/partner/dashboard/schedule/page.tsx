"use client"

import { cn } from "@/lib/utils"
import { useEffect, useMemo, useState, Suspense } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import {
  queryKeys,
  useSalonByOwnerQuery,
  useStaffByUserQuery,
  useSalonByIdQuery,
  useSchedulesByStaffQuery,
} from "@/lib/queries"
import { Loader2, Calendar, Clock, ChevronRight, Save, ShieldAlert, User } from "lucide-react"
import { toast } from "sonner"
import { PartnerSidebar } from "@/components/partner/partner-sidebar"
import Image from "next/image"
import { useSearchParams, useRouter } from "next/navigation"

interface Schedule {
  id?: string
  day_of_week: number
  start_time: string
  end_time: string
  is_day_off: boolean
}

const DAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
]

function ScheduleContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const initialStaffId = searchParams.get("staffId")

  const [user, setUser] = useState<any>(null)
  const [authReady, setAuthReady] = useState(false)
  useEffect(() => {
    const userStr = localStorage.getItem("user")
    if (!userStr) {
      router.replace("/login")
      return
    }
    try {
      setUser(JSON.parse(userStr))
    } catch {
      router.replace("/login")
      return
    }
    setAuthReady(true)
  }, [router])

  const isStaff = user?.role === "staff"
  const isOwner = user?.role === "owner" || user?.role === "admin"

  const ownerSalonQuery = useSalonByOwnerQuery(isOwner ? user?.id : null)
  const staffProfileQuery = useStaffByUserQuery(isStaff ? user?.id : null)
  const staffSalonQuery = useSalonByIdQuery(isStaff ? staffProfileQuery.data?.salonId : null)

  const salon = isOwner ? ownerSalonQuery.data : staffSalonQuery.data
  const salonId: string | undefined = salon?.id

  const teamQuery = useQuery<any[]>({
    queryKey: salonId ? ["staff", "salon", salonId] : ["staff", "salon", "__pending__"],
    queryFn: () => api.getBarbersBySalonId(salonId!),
    enabled: isOwner && !!salonId,
  })

  const staffList: any[] = isStaff
    ? (staffProfileQuery.data ? [staffProfileQuery.data] : [])
    : (teamQuery.data ?? [])

  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  useEffect(() => {
    if (selectedStaffId) return
    if (isStaff && staffProfileQuery.data) {
      setSelectedStaffId(staffProfileQuery.data.id)
      return
    }
    if (isOwner && staffList.length > 0) {
      const initial =
        (initialStaffId && staffList.find(s => s.id === initialStaffId)?.id) ||
        staffList[0].id
      setSelectedStaffId(initial)
    }
  }, [isStaff, isOwner, staffProfileQuery.data, staffList, initialStaffId, selectedStaffId])

  const selectedStaff = useMemo(
    () => staffList.find(s => s.id === selectedStaffId) ?? null,
    [staffList, selectedStaffId],
  )

  const schedulesQuery = useSchedulesByStaffQuery(selectedStaffId)

  const [schedules, setSchedules] = useState<Schedule[]>([])
  useEffect(() => {
    if (!schedulesQuery.data || !selectedStaffId) return
    const fullSchedules = DAYS.map((_, index) => {
      const existing = schedulesQuery.data!.find((s: any) => s.day_of_week === index)
      return existing || {
        day_of_week: index,
        start_time: "09:00",
        end_time: "18:00",
        is_day_off: index >= 5,
      }
    })
    setSchedules(fullSchedules)
  }, [schedulesQuery.data, selectedStaffId])

  const [saving, setSaving] = useState(false)

  const initialLoading =
    !authReady ||
    (isOwner && ownerSalonQuery.isLoading && !salon) ||
    (isStaff && (staffProfileQuery.isLoading || staffSalonQuery.isLoading) && !salon) ||
    (isOwner && teamQuery.isLoading && !teamQuery.data) ||
    (!!salon && !selectedStaffId && staffList.length > 0)

  const refreshing =
    schedulesQuery.isFetching ||
    (isOwner && teamQuery.isFetching && !!teamQuery.data)

  const handleUpdateSchedule = (index: number, updates: Partial<Schedule>) => {
    setSchedules(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s))
  }

  async function saveAll() {
    if (!selectedStaff) return
    setSaving(true)
    try {
      const token = localStorage.getItem("token")
      if (!token) throw new Error("No token found")

      for (const s of schedules) {
        if (s.id) {
          await api.updateSchedule(s.id, {
            start_time: s.start_time,
            end_time: s.end_time,
            is_day_off: s.is_day_off
          }, token)
        } else {
          await api.createSchedule({
            staff_id: selectedStaff.id,
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
            is_day_off: s.is_day_off
          }, token)
        }
      }
      toast.success("Schedules updated successfully!")
      queryClient.invalidateQueries({ queryKey: queryKeys.schedulesByStaff(selectedStaff.id) })
    } catch (err: any) {
      toast.error(err.message || "Failed to save schedules")
    } finally {
      setSaving(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-muted-foreground">Initializing...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <PartnerSidebar />

      <main className="lg:ml-64 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display font-bold text-3xl text-foreground flex items-center gap-3">
              {isStaff ? "My Schedule" : "Working Schedules"}
              {refreshing && <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />}
            </h1>
            <p className="text-muted-foreground mt-1">
              {isStaff
                ? "Your weekly availability at " + (salon?.name || "your salon")
                : "Set individual availability for your team members"}
            </p>
          </div>
          <button
            onClick={saveAll}
            disabled={saving || !selectedStaff}
            className="flex items-center gap-2 px-6 py-3 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-colors brand-glow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Save Changes
          </button>
        </div>

        <div className={cn("grid grid-cols-1 gap-8", !isStaff && "lg:grid-cols-4")}>
          {!isStaff && (
            <div className="lg:col-span-1 space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-2">
                Team Members
              </h2>
              <div className="space-y-1">
                {staffList.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => setSelectedStaffId(member.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl transition-all",
                      selectedStaffId === member.id
                        ? "bg-brand/10 border border-brand/20 text-foreground"
                        : "hover:bg-surface-elevated text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="relative w-10 h-10 rounded-full overflow-hidden border border-border-solid">
                      <Image
                        src={member.avatar}
                        alt={member.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-medium text-sm line-clamp-1">{member.name}</p>
                      <p className="text-xs opacity-70">{member.role}</p>
                    </div>
                    {selectedStaffId === member.id && <ChevronRight className="w-4 h-4 text-brand" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={cn(!isStaff && "lg:col-span-3")}>
            {selectedStaff ? (
              <div className="bento-card">
                <div className="flex items-center justify-between mb-6 pb-6 border-b border-border-solid">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-brand/10 text-brand">
                      <Calendar className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-xl text-foreground">
                        Weekly Schedule for {selectedStaff.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Timezone: {salon?.timezone || "UTC"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {schedules.map((day, index) => (
                    <div 
                      key={index}
                      className={cn(
                        "flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border-solid transition-colors",
                        day.is_day_off ? "bg-muted/30 opacity-70" : "bg-surface-elevated/30"
                      )}
                    >
                      <div className="flex items-center gap-4 mb-4 sm:mb-0 min-w-[150px]">
                        <div className={cn(
                          "w-3 h-3 rounded-full",
                          day.is_day_off ? "bg-muted" : "bg-brand"
                        )} />
                        <span className="font-semibold text-foreground">{DAYS[index]}</span>
                      </div>

                      <div className="flex items-center gap-4">
                        {!day.is_day_off ? (
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            <input
                              type="time"
                              value={day.start_time}
                              onChange={(e) => handleUpdateSchedule(index, { start_time: e.target.value })}
                              className="bg-surface-elevated border border-border-solid rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-brand"
                            />
                            <span className="text-muted-foreground">-</span>
                            <input
                              type="time"
                              value={day.end_time}
                              onChange={(e) => handleUpdateSchedule(index, { end_time: e.target.value })}
                              className="bg-surface-elevated border border-border-solid rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-brand"
                            />
                          </div>
                        ) : (
                          <span className="text-sm font-medium text-muted-foreground italic">Day Off</span>
                        )}

                        <div className="flex items-center gap-2 ml-4 pl-4 border-l border-border-solid">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="sr-only peer"
                              checked={!day.is_day_off}
                              onChange={() => handleUpdateSchedule(index, { is_day_off: !day.is_day_off })}
                            />
                            <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
                          </label>
                          <span className="text-xs text-muted-foreground w-12">
                            {!day.is_day_off ? "Open" : "Closed"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 p-4 bg-gold/10 border border-gold/20 rounded-xl flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                  <p className="text-sm text-gold-foreground">
                    Changing a staff member's schedule will only affect future bookings. Existing appointments will remain at their original times.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bento-card flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <User className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">No Staff Selected</h3>
                <p className="text-muted-foreground max-w-xs">
                  Please select a team member from the list to manage their working hours.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default function SchedulePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    }>
      <ScheduleContent />
    </Suspense>
  )
}
