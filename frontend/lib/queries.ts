import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"

export const queryKeys = {
  me: () => ["me"] as const,
  salonByOwner: (ownerId: string) => ["salon", "owner", ownerId] as const,
  salonById: (salonId: string) => ["salon", "id", salonId] as const,
  salonStats: (salonId: string) => ["salon", salonId, "stats"] as const,
  bookingsBySalon: (salonId: string) => ["bookings", "salon", salonId] as const,
  bookingsForClient: (clientId: string) => ["bookings", "client", clientId] as const,
  bookingsForStaff: (staffId: string) => ["bookings", "staff", staffId] as const,
  staffByUser: (userId: string) => ["staff", "user", userId] as const,
  schedulesByStaff: (staffId: string) => ["schedules", "staff", staffId] as const,
}

export function useMeQuery(token: string | null | undefined) {
  return useQuery<any>({
    queryKey: queryKeys.me(),
    queryFn: () => api.getMe(token!),
    enabled: !!token,
  })
}

export function useSalonByOwnerQuery(ownerId: string | null | undefined) {
  return useQuery<any>({
    queryKey: ownerId ? queryKeys.salonByOwner(ownerId) : ["salon", "owner", "__pending__"],
    queryFn: () => api.getSalonByOwnerId(ownerId!),
    enabled: !!ownerId,
  })
}

export function useSalonStatsQuery(
  salonId: string | null | undefined,
  token: string | null | undefined,
) {
  return useQuery<any>({
    queryKey: salonId ? queryKeys.salonStats(salonId) : ["salon", "__pending__", "stats"],
    queryFn: () => api.getSalonStats(salonId!, token!),
    enabled: !!salonId && !!token,
  })
}

export function useBookingsBySalonQuery(
  salonId: string | null | undefined,
  token: string | null | undefined,
) {
  return useQuery<any[]>({
    queryKey: salonId ? queryKeys.bookingsBySalon(salonId) : ["bookings", "salon", "__pending__"],
    queryFn: () => api.getBookingsBySalon(salonId!, token!),
    enabled: !!salonId && !!token,
  })
}

export function useBookingsForClientQuery(
  clientId: string | null | undefined,
  token: string | null | undefined,
) {
  const enabled = !!clientId && !!token
  return useQuery<any[]>({
    queryKey: clientId ? queryKeys.bookingsForClient(clientId) : ["bookings", "client", "__pending__"],
    queryFn: () => api.getBookingsForClient(clientId!, token!),
    enabled,
  })
}

export function useStaffByUserQuery(userId: string | null | undefined) {
  return useQuery<any>({
    queryKey: userId ? queryKeys.staffByUser(userId) : ["staff", "user", "__pending__"],
    queryFn: () => api.getStaffByUserId(userId!),
    enabled: !!userId,
  })
}

export function useSalonByIdQuery(salonId: string | null | undefined) {
  return useQuery<any>({
    queryKey: salonId ? queryKeys.salonById(salonId) : ["salon", "id", "__pending__"],
    queryFn: () => api.getSalonById(salonId!),
    enabled: !!salonId,
  })
}

export function useSchedulesByStaffQuery(staffId: string | null | undefined) {
  return useQuery<any[]>({
    queryKey: staffId ? queryKeys.schedulesByStaff(staffId) : ["schedules", "staff", "__pending__"],
    queryFn: () => api.getSchedulesByStaffId(staffId!),
    enabled: !!staffId,
  })
}

export function useBookingsForStaffQuery(
  staffId: string | null | undefined,
  token: string | null | undefined,
) {
  const enabled = !!staffId && !!token
  return useQuery<any[]>({
    queryKey: staffId ? queryKeys.bookingsForStaff(staffId) : ["bookings", "staff", "__pending__"],
    queryFn: () => api.getBookingsForStaff(staffId!, token!),
    enabled,
  })
}
