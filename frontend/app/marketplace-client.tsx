"use client"

import { useMemo, useState } from "react"
import { SearchBar } from "@/components/marketplace/search-bar"
import { SalonCard } from "@/components/marketplace/salon-card"
import { Scissors } from "lucide-react"
import type { Salon } from "@/lib/api"

interface MarketplaceClientProps {
  initialSalons: Salon[]
}

export function MarketplaceClient({ initialSalons }: MarketplaceClientProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCity, setSelectedCity] = useState("All Cities")

  const filteredSalons = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return initialSalons.filter((salon) => {
      const matchesSearch =
        q === "" ||
        salon.name.toLowerCase().includes(q) ||
        (Array.isArray(salon.tags) && salon.tags.some((tag: string) => tag.toLowerCase().includes(q))) ||
        (salon.description ?? "").toLowerCase().includes(q)

      const matchesCity =
        selectedCity === "All Cities" || salon.city === selectedCity

      return matchesSearch && matchesCity
    })
  }, [initialSalons, searchQuery, selectedCity])

  return (
    <>
      <SearchBar
        onSearch={setSearchQuery}
        onCityChange={setSelectedCity}
        selectedCity={selectedCity}
      />

      <section className="py-12">
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

        {filteredSalons.length > 0 ? (
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
      </section>
    </>
  )
}
