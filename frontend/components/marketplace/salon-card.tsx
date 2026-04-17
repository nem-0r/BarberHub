"use client"

import Image from "next/image"
import Link from "next/link"
import { Star, MapPin, Clock } from "lucide-react"
import type { Salon } from "@/lib/api"
import { cn } from "@/lib/utils"

interface SalonCardProps {
  salon: Salon
}

export function SalonCard({ salon }: SalonCardProps) {
  return (
    <Link
      href={`/salon/${salon.id}`}
      className="group block bg-card border border-border-solid rounded-2xl overflow-hidden hover:border-brand/30 transition-all duration-300 hover:shadow-lg hover:shadow-brand/5"
    >
      {/* Cover Image */}
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={salon.coverImage}
          alt={salon.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {/* Open Status Badge */}
        <div className="absolute top-3 left-3">
          <span
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md",
              salon.isOpen
                ? "bg-brand/20 text-brand border border-brand/30"
                : "bg-destructive/20 text-destructive border border-destructive/30"
            )}
          >
            {salon.isOpen ? "Open Now" : "Closed"}
          </span>
        </div>
        {/* Price Range */}
        <div className="absolute top-3 right-3">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-surface/80 backdrop-blur-md text-foreground">
            {salon.priceRange}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Name and Rating */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-display font-bold text-lg text-foreground group-hover:text-brand transition-colors line-clamp-1">
            {salon.name}
          </h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Star className="w-4 h-4 text-gold fill-gold" />
            <span className="text-sm font-semibold text-foreground">{salon.rating}</span>
            <span className="text-xs text-muted-foreground">({salon.reviewCount})</span>
          </div>
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5 text-muted-foreground text-sm mb-3">
          <MapPin className="w-3.5 h-3.5" />
          <span className="line-clamp-1">{salon.address}, {salon.city}</span>
        </div>

        {/* Hours */}
        {salon.isOpen && (
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm mb-3">
            <Clock className="w-3.5 h-3.5" />
            <span>Open until {salon.openUntil}</span>
          </div>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {salon.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 rounded-md bg-surface-elevated text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  )
}
