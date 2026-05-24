import { Navbar } from "@/components/barberhub/navbar"
import { Scissors, TrendingUp, Users, Clock } from "lucide-react"
import { getSalonsServer } from "@/lib/api-server"
import { MarketplaceClient } from "./marketplace-client"

const stats = [
  { icon: Scissors, label: "Partner Salons", value: "500+" },
  { icon: Users, label: "Happy Clients", value: "50K+" },
  { icon: TrendingUp, label: "Monthly Bookings", value: "25K+" },
  { icon: Clock, label: "Hours Saved", value: "10K+" },
]

export const revalidate = 60

export default async function MarketplacePage() {
  const salons = await getSalonsServer(60)

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="pt-24 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl text-foreground mb-4 text-balance">
              Find Your Perfect{" "}
              <span className="text-gradient-brand">Barbershop</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
              Discover top-rated barbershops near you. Book appointments instantly and experience premium grooming services.
            </p>
          </div>

          <MarketplaceClient initialSalons={salons} />

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
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-brand/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-gold/10 blur-3xl" />
          </div>
        </div>
      </section>

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
