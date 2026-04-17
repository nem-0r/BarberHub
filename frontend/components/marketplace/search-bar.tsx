"use client"

import { Search, MapPin, ChevronDown } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { CITIES } from "@/lib/api"
import { cn } from "@/lib/utils"

interface SearchBarProps {
  onSearch: (query: string) => void
  onCityChange: (city: string) => void
  selectedCity: string
}

export function SearchBar({ onSearch, onCityChange, selectedCity }: SearchBarProps) {
  const [query, setQuery] = useState("")
  const [cityOpen, setCityOpen] = useState(false)
  const cityRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (cityRef.current && !cityRef.current.contains(event.target as Node)) {
        setCityOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSearch(query)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-3xl mx-auto flex items-center gap-2 bg-surface border border-border-solid rounded-2xl p-2"
    >
      {/* City Selector */}
      <div ref={cityRef} className="relative">
        <button
          type="button"
          onClick={() => setCityOpen(!cityOpen)}
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface-elevated hover:bg-muted transition-colors text-sm font-medium text-foreground min-w-[160px] justify-between"
        >
          <span className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-brand" />
            <span className="truncate">{selectedCity}</span>
          </span>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", cityOpen && "rotate-180")} />
        </button>

        {cityOpen && (
          <div className="absolute top-full left-0 mt-2 w-full bg-surface-elevated border border-border-solid rounded-xl shadow-lg overflow-hidden z-50">
            {CITIES.map((city) => (
              <button
                key={city}
                type="button"
                onClick={() => {
                  onCityChange(city)
                  setCityOpen(false)
                }}
                className={cn(
                  "w-full px-4 py-2.5 text-left text-sm hover:bg-muted transition-colors",
                  selectedCity === city ? "text-brand bg-brand/10" : "text-foreground"
                )}
              >
                {city}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-border-solid" />

      {/* Search Input */}
      <div className="flex-1 flex items-center gap-3 px-3">
        <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            onSearch(e.target.value)
          }}
          placeholder="Search barbershops, services..."
          className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-sm"
        />
      </div>

      {/* Search Button */}
      <button
        type="submit"
        className="px-6 py-3 bg-brand text-brand-foreground rounded-xl font-semibold text-sm hover:bg-brand/90 transition-colors brand-glow-sm"
      >
        Search
      </button>
    </form>
  )
}
