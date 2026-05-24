"use client"

import { use, useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Navbar } from "@/components/barberhub/navbar"
import { api } from "@/lib/api"
import {
  Star,
  MapPin,
  Clock,
  Phone,
  ArrowLeft,
  ChevronRight,
  Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"

type Tab = "services" | "barbers" | "reviews"

export default function SalonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  
  const [salon, setSalon] = useState<any>(null)
  const [barbers, setBarbers] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>("services")

  useEffect(() => {
    async function loadData() {
      try {
        const [salonData, barbersData, servicesData, reviewsData] = await Promise.all([
          api.getSalonById(id),
          api.getBarbersBySalonId(id),
          api.getServicesBySalonId(id),
          api.getReviews(id)
        ])
        setSalon(salonData)
        setBarbers(barbersData)
        setServices(servicesData)
        setReviews(reviewsData)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
        <p className="text-muted-foreground">Gathering information about the salon...</p>
      </div>
    )
  }

  if (!salon) {
    notFound()
  }

  const activeServices = services.filter((s: any) => s.isActive !== false)

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "services", label: "Services", count: activeServices.length },
    { id: "barbers", label: "Barbers", count: barbers.length },
    { id: "reviews", label: "Reviews", count: reviews.length },
  ]

  const servicesByCategory = activeServices.reduce(
    (acc, service) => {
      if (!acc[service.category]) {
        acc[service.category] = []
      }
      acc[service.category].push(service)
      return acc
    },
    {} as Record<string, typeof services>
  )

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="relative h-[300px] sm:h-[400px]">
        <Image
          src={salon.coverImage}
          alt={salon.name}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

        <div className="absolute top-20 left-6">
          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface/80 backdrop-blur-md text-foreground text-sm font-medium hover:bg-surface transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 -mt-24 relative z-10">
        <div className="bg-card border border-border-solid rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium",
                    salon.isOpen
                      ? "bg-brand/20 text-brand"
                      : "bg-destructive/20 text-destructive"
                  )}
                >
                  {salon.isOpen ? "Open Now" : "Closed"}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-surface-elevated text-foreground">
                  {salon.priceRange}
                </span>
              </div>

              <h1 className="font-display font-bold text-3xl sm:text-4xl text-foreground mb-2">
                {salon.name}
              </h1>

              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-1">
                  <Star className="w-5 h-5 text-gold fill-gold" />
                  <span className="font-semibold text-foreground">
                    {salon.rating}
                  </span>
                </div>
                <span className="text-muted-foreground">
                  ({salon.reviewCount} reviews)
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>
                    {salon.address}, {salon.city}
                  </span>
                </div>
                {salon.isOpen && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>Open until {salon.openUntil}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>(555) 123-4567</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                {salon.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-lg bg-surface-elevated text-sm text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <Link
              href={`/book/${salon.id}`}
              className="flex-shrink-0 inline-flex items-center justify-center gap-2 px-8 py-4 bg-brand text-brand-foreground rounded-xl font-semibold text-base hover:bg-brand/90 transition-colors brand-glow"
            >
              Book Now
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <p className="mt-6 text-muted-foreground leading-relaxed">
            {salon.description}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 mt-8">
        <div className="flex items-center gap-2 border-b border-border-solid">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-6 py-3 text-sm font-medium transition-all border-b-2 -mb-px",
                activeTab === tab.id
                  ? "text-brand border-brand"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              {tab.label}
              <span className="ml-2 text-xs text-muted-foreground">
                ({tab.count})
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {activeTab === "services" && (
          <div className="space-y-8">
            {(Object.entries(servicesByCategory) as [string, any[]][]).map(([category, categoryServices]) => (
              <div key={category}>
                <h3 className="font-display font-bold text-lg text-foreground mb-4">
                  {category}
                </h3>
                <div className="space-y-3">
                  {categoryServices.map((service: any) => (
                    <div
                      key={service.id}
                      className="flex items-center justify-between p-4 bg-surface rounded-xl border border-border-solid hover:border-brand/30 transition-colors"
                    >
                      <div className="flex-1">
                        <h4 className="font-semibold text-foreground">
                          {service.name}
                        </h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {service.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {service.duration} min
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-lg text-brand">
                          {service.price} ₸
                        </span>
                        <Link
                          href={`/book/${salon.id}?service=${service.id}`}
                          className="px-4 py-2 bg-surface-elevated hover:bg-brand hover:text-brand-foreground rounded-lg text-sm font-medium transition-colors"
                        >
                          Select
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "barbers" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {barbers.map((barber) => (
              <div
                key={barber.id}
                className="flex items-center gap-4 p-4 bg-surface rounded-xl border border-border-solid"
              >
                <div className="relative w-16 h-16 rounded-full overflow-hidden flex-shrink-0">
                  <Image
                    src={barber.avatar}
                    alt={barber.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-foreground truncate">
                    {barber.name}
                  </h4>
                  <p className="text-sm text-muted-foreground">{barber.role}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1 text-sm">
                      <Star className="w-3.5 h-3.5 text-gold fill-gold" />
                      <span className="text-foreground">{barber.rating}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {barber.yearsExperience} years exp.
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {barber.specialties.map((spec: string) => (
                      <span
                        key={spec}
                        className="px-2 py-0.5 rounded bg-surface-elevated text-xs text-muted-foreground"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>
                <Link
                  href={`/book/${salon.id}?barber=${barber.id}`}
                  className="px-4 py-2 bg-brand/10 text-brand hover:bg-brand hover:text-brand-foreground rounded-lg text-sm font-medium transition-colors flex-shrink-0"
                >
                  Book
                </Link>
              </div>
            ))}
          </div>
        )}

        {activeTab === "reviews" && (
          <div className="space-y-4">
            {reviews.length > 0 ? (
              reviews.map((review) => (
                <div
                  key={review.id}
                  className="p-4 bg-surface rounded-xl border border-border-solid"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative w-10 h-10 rounded-full overflow-hidden">
                      <Image
                        src={review.avatar}
                        alt={review.author}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {review.author}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {review.date}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "w-4 h-4",
                            i < review.rating
                              ? "text-gold fill-gold"
                              : "text-muted-foreground"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    {review.comment}
                  </p>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No reviews yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
