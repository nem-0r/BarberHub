"use client"

import { useState, useMemo, useEffect } from "react"
import { Navbar } from "@/components/barberhub/navbar"
import { SearchBar } from "@/components/marketplace/search-bar"
import { SalonCard } from "@/components/marketplace/salon-card"
import { api } from "@/lib/api"
import { Scissors, TrendingUp, Users, Clock, Loader2 } from "lucide-react"

const stats = [
  { icon: Scissors, label: "Partner Salons", value: "500+" },
  { icon: Users, label: "Happy Clients", value: "50K+" },
  { icon: TrendingUp, label: "Monthly Bookings", value: "25K+" },
  { icon: Clock, label: "Hours Saved", value: "10K+" },
]

export default function MarketplacePage() {
  const [salons, setSalons] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCity, setSelectedCity] = useState("All Cities")

  useEffect(() => {
    async function loadSalons() {
      try {
        const data = await api.getSalons()
        setSalons(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadSalons()
  }, [])

  const filteredSalons = useMemo(() => {
    return salons.filter((salon) => {
      const matchesSearch =
        searchQuery === "" ||
        salon.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        salon.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
        salon.description.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesCity =
        selectedCity === "All Cities" || salon.city === selectedCity

      return matchesSearch && matchesCity
    })
  }, [searchQuery, selectedCity])

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-24 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl text-foreground mb-4 text-balance">
              Find Your Perfect{" "}
              <span className="text-gradient-brand">Barbershop</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
              Discover top-rated barbershops near you. Book appointments instantly and experience premium grooming services.
            </p>
          </div>

          {/* Search Bar */}
          <SearchBar
            onSearch={setSearchQuery}
            onCityChange={setSelectedCity}
            selectedCity={selectedCity}
          />

          {/* Quick Stats */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-3 p-4 rounded-xl bg-surface border border-border-solid"
              >
                <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-brand" />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Salon Grid */}
      <section className="py-12 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="font-display font-bold text-2xl text-foreground">
                {selectedCity === "All Cities" ? "All Barbershops" : `Barbershops in ${selectedCity}`}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {filteredSalons.length} {filteredSalons.length === 1 ? "result" : "results"} found
              </p>
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-surface/50 rounded-3xl border border-dashed border-border-solid">
              <Loader2 className="w-10 h-10 text-brand animate-spin mb-4" />
              <p className="text-muted-foreground animate-pulse">Loading best barbershops for you...</p>
            </div>
          ) : filteredSalons.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSalons.map((salon) => (
                <SalonCard key={salon.id} salon={salon} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-full bg-surface-elevated mx-auto mb-4 flex items-center justify-center">
                <Scissors className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-display font-bold text-xl text-foreground mb-2">
                No barbershops found
              </h3>
              <p className="text-muted-foreground">
                Try adjusting your search or selecting a different city.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand/20 via-surface to-gold/10 border border-brand/20 p-8 sm:p-12">
            <div className="relative z-10 text-center">
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-foreground mb-4">
                Own a Barbershop?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                Join BarberHub and reach thousands of new clients. Manage bookings, staff, and grow your business with our powerful tools.
              </p>
              <a
                href="/auth/partner-register"
                className="inline-flex items-center gap-2 px-8 py-4 bg-brand text-brand-foreground rounded-xl font-semibold hover:bg-brand/90 transition-colors brand-glow"
              >
                Become a Partner
              </a>
            </div>
            {/* Decorative elements */}
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-brand/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-gold/10 blur-3xl" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border-solid">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
              <Scissors className="w-4 h-4 text-brand-foreground" />
            </div>
            <span className="font-display font-bold text-foreground">
              Barber<span className="text-brand">Hub</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            2026 BarberHub. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
