"use client"

import { use, useState, useMemo, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams, usePathname, useRouter } from "next/navigation"
import { notFound } from "next/navigation"
import { Navbar } from "@/components/barberhub/navbar"
import { api } from "@/lib/api"
import { toUtcIsoFromSalonLocal } from "@/lib/datetime"
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Star,
  Calendar,
  User,
  Scissors,
  CreditCard,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Step = 1 | 2 | 3 | 4

const steps = [
  { id: 1, label: "Service", icon: Scissors },
  { id: 2, label: "Barber", icon: User },
  { id: 3, label: "Date & Time", icon: Calendar },
  { id: 4, label: "Confirm", icon: CreditCard },
]


function isSlotInPast(dateStr: string, time: string, tz?: string): boolean {
  try {
    const iso = toUtcIsoFromSalonLocal(dateStr, time, tz)
    return new Date(iso).getTime() <= Date.now()
  } catch {
    return false
  }
}

function generateDates() {
  const dates = []
  const today = new Date()
  for (let i = 0; i < 14; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    dates.push({
      date,
      day: date.toLocaleDateString("en-US", { weekday: "short" }),
      num: date.getDate(),
      month: date.toLocaleDateString("en-US", { month: "short" }),
      full: date.toISOString().split("T")[0],
    })
  }
  return dates
}

export default function BookingPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = use(params)
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const [salon, setSalon] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bookingLoading, setBookingLoading] = useState(false)
  const dates = useMemo(() => generateDates(), [])

  const preSelectedService = searchParams.get("service")
  const preSelectedBarber = searchParams.get("barber")

  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [selectedBarber, setSelectedBarber] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [isBooked, setIsBooked] = useState(false)
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [barberServiceMap, setBarberServiceMap] = useState<Record<string, Map<string, number | null>>>({})
  const [barberMapLoading, setBarberMapLoading] = useState(true)
  const [bookedPrice, setBookedPrice] = useState<number | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const [salonData, barbersData, servicesData] = await Promise.all([
          api.getSalonById(salonId),
          api.getBarbersBySalonId(salonId),
          api.getServicesBySalonId(salonId)
        ])
        setSalon(salonData)
        setBarbers(barbersData)
        setServices(servicesData)

        if (preSelectedService) setSelectedService(preSelectedService)
        if (preSelectedBarber) setSelectedBarber(preSelectedBarber)
        if (preSelectedService) setCurrentStep(2)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [salonId, preSelectedService, preSelectedBarber])

  useEffect(() => {
    if (barbers.length === 0) return
    let cancelled = false
    setBarberMapLoading(true)
    Promise.all(
      barbers.map((b) =>
        api.getStaffServices(b.id)
          .then((links: any[]) => [
            b.id,
            new Map<string, number | null>(
              links.map((l) => [
                l.service_id,
                l.custom_price != null ? Number(l.custom_price) : null,
              ]),
            ),
          ] as const)
          .catch(() => [b.id, new Map<string, number | null>()] as const),
      ),
    ).then((entries) => {
      if (cancelled) return
      const map = Object.fromEntries(entries)
      setBarberServiceMap(map)
      setBarberMapLoading(false)
      if (preSelectedBarber && selectedService && !map[preSelectedBarber]?.has(selectedService)) {
        setSelectedBarber(null)
      }
    })
    return () => { cancelled = true }
  }, [barbers, preSelectedBarber, selectedService])

  useEffect(() => {
    if (!selectedBarber || !selectedDate || !selectedService) {
      setAvailableSlots([])
      return
    }
    setSlotsLoading(true)
    setSelectedTime(null)
    api.getAvailableSlots(selectedBarber, selectedDate, selectedService)
      .then(setAvailableSlots)
      .catch(() => setAvailableSlots([]))
      .finally(() => setSlotsLoading(false))
  }, [selectedBarber, selectedDate, selectedService])

  const selectedServiceData = services.find((s) => s.id === selectedService)
  const selectedBarberData = barbers.find((b) => b.id === selectedBarber)
  const selectedDateData = dates.find((d) => d.full === selectedDate)

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-muted-foreground">Setting up your booking session...</p>
      </div>
    )
  }

  if (!salon) {
    notFound()
  }

  function canProceed() {
    switch (currentStep) {
      case 1:
        return !!selectedService
      case 2:
        return !!selectedBarber
      case 3:
        return !!selectedDate && !!selectedTime
      default:
        return false
    }
  }

  function handleNext() {
    if (currentStep < 4 && canProceed()) {
      setCurrentStep((currentStep + 1) as Step)
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step)
    }
  }

  function handleConfirm() {
    setBookingLoading(true)

    const token = localStorage.getItem("token")
    const userStr = localStorage.getItem("user")

    if (!token || !userStr) {
      localStorage.removeItem("token")
      localStorage.removeItem("user")
      const qs = searchParams.toString()
      const here = qs ? `${pathname}?${qs}` : pathname
      setBookingLoading(false)
      router.replace(`/login?redirect=${encodeURIComponent(here)}`)
      return
    }

    const currentUser = JSON.parse(userStr)

    const startUtcIso = toUtcIsoFromSalonLocal(
      selectedDate!,
      selectedTime!,
      salon?.timezone,
    )

    const payload = {
      client_id: currentUser.id,
      staff_id: selectedBarber,
      service_id: selectedService,
      start_time: startUtcIso,
    }

    api.createBooking(payload, token)
      .then((booking: any) => {
        if (booking?.final_price != null) setBookedPrice(Number(booking.final_price))
        setIsBooked(true)
      })
      .catch(err => {
        if ((err as any).code === "UNAUTHORIZED") {
          localStorage.removeItem("token")
          localStorage.removeItem("user")
          const qs = searchParams.toString()
          const here = qs ? `${pathname}?${qs}` : pathname
          setBookingLoading(false)
          router.replace(`/login?redirect=${encodeURIComponent(here)}`)
          return
        }
        toast.error("Booking failed: " + (err.message || "Unknown error"))
      })
      .finally(() => setBookingLoading(false))
  }

  const bookableServices = services.filter((s: any) => s.isActive !== false)

  const servicesByCategory = bookableServices.reduce(
    (acc, service) => {
      if (!acc[service.category]) {
        acc[service.category] = []
      }
      acc[service.category].push(service)
      return acc
    },
    {} as Record<string, typeof services>
  )

  const eligibleBarbers = selectedService
    ? barbers.filter((b) => barberServiceMap[b.id]?.has(selectedService))
    : barbers

  const customPrice =
    selectedBarber && selectedService
      ? barberServiceMap[selectedBarber]?.get(selectedService)
      : null
  const effectivePrice =
    customPrice != null ? customPrice : selectedServiceData?.price

  if (isBooked) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-16 px-6">
          <div className="max-w-lg mx-auto text-center">
            <div className="w-20 h-20 rounded-full bg-brand/20 mx-auto mb-6 flex items-center justify-center">
              <Check className="w-10 h-10 text-brand" />
            </div>
            <h1 className="font-display font-bold text-3xl text-foreground mb-4">
              Booking Confirmed!
            </h1>
            <p className="text-muted-foreground mb-8">
              Your appointment at {salon.name} has been booked. Please pay at
              the salon when you arrive.
            </p>

            <div className="bg-surface border border-border-solid rounded-2xl p-6 text-left mb-8">
              <h3 className="font-semibold text-foreground mb-4">
                Appointment Details
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service</span>
                  <span className="text-foreground font-medium">
                    {selectedServiceData?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Barber</span>
                  <span className="text-foreground font-medium">
                    {selectedBarberData?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="text-foreground font-medium">
                    {selectedDateData?.month} {selectedDateData?.num}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time</span>
                  <span className="text-foreground font-medium">
                    {selectedTime}
                  </span>
                </div>
                <div className="border-t border-border-solid pt-3 mt-3 flex justify-between">
                  <span className="text-foreground font-semibold">Total</span>
                  <span className="text-brand font-bold text-lg">
                    {bookedPrice ?? selectedServiceData?.price} ₸
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Link
                href="/profile"
                className="w-full py-3 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-colors"
              >
                View My Bookings
              </Link>
              <Link
                href="/"
                className="w-full py-3 bg-surface-elevated text-foreground rounded-xl font-medium hover:bg-muted transition-colors"
              >
                Back to Marketplace
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-24 pb-16 px-6">
        <div className="max-w-4xl mx-auto">
          <Link
            href={`/salon/${salonId}`}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to {salon.name}
          </Link>

          <div className="mb-8">
            <h1 className="font-display font-bold text-3xl text-foreground mb-2">
              Book an Appointment
            </h1>
            <p className="text-muted-foreground">{salon.name}</p>
          </div>

          <div className="flex items-center justify-between mb-10">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                      currentStep > step.id
                        ? "bg-brand text-brand-foreground"
                        : currentStep === step.id
                          ? "bg-brand/20 text-brand border-2 border-brand"
                          : "bg-surface-elevated text-muted-foreground"
                    )}
                  >
                    {currentStep > step.id ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <step.icon className="w-5 h-5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-xs mt-2 font-medium",
                      currentStep >= step.id
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-4",
                      currentStep > step.id ? "bg-brand" : "bg-surface-elevated"
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="bg-surface border border-border-solid rounded-2xl p-6 sm:p-8">
            {currentStep === 1 && (
              <div>
                <h2 className="font-display font-bold text-xl text-foreground mb-6">
                  Choose a Service
                </h2>
                {bookableServices.length === 0 ? (
                  <div className="py-12 text-center border border-dashed border-border-solid rounded-xl">
                    <Scissors className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">
                      В этом салоне пока нет услуг.
                    </p>
                  </div>
                ) : (
                <div className="space-y-6">
                  {(Object.entries(servicesByCategory) as [string, any[]][]).map(
                    ([category, categoryServices]) => (
                      <div key={category}>
                        <h3 className="text-sm font-medium text-muted-foreground mb-3">
                          {category}
                        </h3>
                        <div className="space-y-2">
                          {categoryServices.map((service: any) => (
                            <button
                              key={service.id}
                              onClick={() => setSelectedService(service.id)}
                              className={cn(
                                "w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left",
                                selectedService === service.id
                                  ? "border-brand bg-brand/10"
                                  : "border-border-solid hover:border-brand/30"
                              )}
                            >
                              <div>
                                <p className="font-semibold text-foreground">
                                  {service.name}
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {service.description}
                                </p>
                                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {service.duration} min
                                </p>
                              </div>
                              <span className="font-bold text-lg text-brand">
                                {service.price} ₸
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
                )}
              </div>
            )}

            {currentStep === 2 && (
              <div>
                <h2 className="font-display font-bold text-xl text-foreground mb-6">
                  Choose Your Barber
                </h2>
                {barberMapLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading available barbers...
                  </div>
                ) : eligibleBarbers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6">
                    No barber at this salon performs the selected service yet.
                    Please pick a different service or check back later.
                  </p>
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {eligibleBarbers.map((barber) => (
                    <button
                      key={barber.id}
                      onClick={() => setSelectedBarber(barber.id)}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                        selectedBarber === barber.id
                          ? "border-brand bg-brand/10"
                          : "border-border-solid hover:border-brand/30"
                      )}
                    >
                      <div className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0">
                        <Image
                          src={barber.avatar}
                          alt={barber.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">
                          {barber.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {barber.role}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          <Star className="w-3.5 h-3.5 text-gold fill-gold" />
                          <span className="text-sm text-foreground">
                            {barber.rating}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                )}
              </div>
            )}

            {currentStep === 3 && (
              <div>
                <h2 className="font-display font-bold text-xl text-foreground mb-6">
                  Pick a Date & Time
                </h2>
                <div className="mb-8">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    Select Date
                  </h3>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {dates.map((date) => (
                      <button
                        key={date.full}
                        onClick={() => setSelectedDate(date.full)}
                        className={cn(
                          "flex-shrink-0 flex flex-col items-center p-3 rounded-xl border transition-all min-w-[70px]",
                          selectedDate === date.full
                            ? "border-brand bg-brand/10"
                            : "border-border-solid hover:border-brand/30"
                        )}
                      >
                        <span className="text-xs text-muted-foreground">
                          {date.day}
                        </span>
                        <span className="text-lg font-bold text-foreground">
                          {date.num}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {date.month}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    Select Time
                  </h3>
                  {slotsLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading available times...
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {selectedDate && selectedBarber && selectedService
                        ? "No available slots for this day. The barber may be off or fully booked."
                        : "Select a service, barber, and date to see available times."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {availableSlots.map((time) => {
                        const past = isSlotInPast(selectedDate!, time, salon?.timezone)
                        return (
                          <button
                            key={time}
                            onClick={() => !past && setSelectedTime(time)}
                            disabled={past}
                            aria-disabled={past}
                            title={past ? "This time has already passed" : undefined}
                            className={cn(
                              "py-2 px-3 rounded-lg border text-sm font-medium transition-all",
                              past
                                ? "border-border-solid text-muted-foreground/40 line-through bg-muted/20 cursor-not-allowed"
                                : selectedTime === time
                                  ? "border-brand bg-brand/10 text-brand"
                                  : "border-border-solid text-muted-foreground hover:border-brand/30 hover:text-foreground"
                            )}
                          >
                            {time}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div>
                <h2 className="font-display font-bold text-xl text-foreground mb-6">
                  Confirm Your Booking
                </h2>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-4 p-4 bg-surface-elevated rounded-xl">
                    <Scissors className="w-5 h-5 text-brand" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Service</p>
                      <p className="font-semibold text-foreground">
                        {selectedServiceData?.name}
                      </p>
                    </div>
                    <span className="font-bold text-brand">
                      {effectivePrice} ₸
                    </span>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-surface-elevated rounded-xl">
                    <div className="relative w-10 h-10 rounded-full overflow-hidden bg-surface-elevated flex items-center justify-center">
                      {selectedBarberData?.avatar ? (
                        <Image
                          src={selectedBarberData.avatar}
                          alt={selectedBarberData?.name || ""}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <span className="text-xs font-bold text-muted-foreground">
                          {selectedBarberData?.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Barber</p>
                      <p className="font-semibold text-foreground">
                        {selectedBarberData?.name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-surface-elevated rounded-xl">
                    <Calendar className="w-5 h-5 text-brand" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Date & Time
                      </p>
                      <p className="font-semibold text-foreground">
                        {selectedDateData?.day}, {selectedDateData?.month}{" "}
                        {selectedDateData?.num} at {selectedTime}
                      </p>
                    </div>
                  </div>

                </div>

                <div className="border-t border-border-solid pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted-foreground">Service</span>
                    <span className="text-foreground">
                      {effectivePrice} ₸
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-bold text-lg">
                    <span className="text-foreground">Total Due at Salon</span>
                    <span className="text-brand">
                      {effectivePrice} ₸
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-6">
            <button
              onClick={handleBack}
              disabled={currentStep === 1}
              className={cn(
                "px-6 py-3 rounded-xl font-medium transition-colors",
                currentStep === 1
                  ? "text-muted-foreground cursor-not-allowed"
                  : "text-foreground hover:bg-surface-elevated"
              )}
            >
              Back
            </button>

            {currentStep < 4 ? (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className={cn(
                  "px-8 py-3 rounded-xl font-semibold transition-all flex items-center gap-2",
                  canProceed()
                    ? "bg-brand text-brand-foreground hover:bg-brand/90 brand-glow-sm"
                    : "bg-surface-elevated text-muted-foreground cursor-not-allowed"
                )}
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={bookingLoading}
                className="px-8 py-3 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-all brand-glow flex items-center gap-2 disabled:opacity-50"
              >
                {bookingLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Confirm Booking - Pay at Salon
                    <Check className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
