"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  TrendingUp, Users, Calendar, Cpu, MoreHorizontal,
  ArrowUpRight, ArrowDownRight, Scissors, Clock,
  CheckCircle, AlertCircle, XCircle, ChevronRight, Brain
} from "lucide-react"
import { Navbar } from "@/components/barberhub/navbar"
import { cn } from "@/lib/utils"
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts"

const METRIC_CARDS = [
  {
    title: "Total Revenue",
    value: "$12,480",
    change: "+18.2%",
    positive: true,
    icon: TrendingUp,
    color: "text-brand",
    bgColor: "bg-brand/10",
    sub: "vs last month",
  },
  {
    title: "Appointments",
    value: "348",
    change: "+12.4%",
    positive: true,
    icon: Calendar,
    color: "text-gold",
    bgColor: "bg-gold/10",
    sub: "this month",
  },
  {
    title: "Active Staff",
    value: "4",
    change: "Full team",
    positive: true,
    icon: Users,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    sub: "2 available now",
  },
  {
    title: "Celery Queue",
    value: "14",
    change: "3 pending",
    positive: false,
    icon: Cpu,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    sub: "tasks in queue",
  },
]

const REVENUE_DATA = [
  { month: "Oct", revenue: 8200, bookings: 210 },
  { month: "Nov", revenue: 9100, bookings: 245 },
  { month: "Dec", revenue: 11400, bookings: 290 },
  { month: "Jan", revenue: 10200, bookings: 275 },
  { month: "Feb", revenue: 11800, bookings: 310 },
  { month: "Mar", revenue: 12480, bookings: 348 },
]

const SERVICE_DATA = [
  { name: "Fade", count: 142 },
  { name: "Classic", count: 89 },
  { name: "Beard", count: 67 },
  { name: "Shave", count: 34 },
  { name: "Color", count: 16 },
]

const TODAY_BOOKINGS = [
  { id: "B001", client: "Alex Kim", service: "Skin Fade", barber: "Marcus J.", barberImg: "/images/barber-1.jpg", time: "9:00 AM", price: 35, status: "completed" },
  { id: "B002", client: "Ray Patel", service: "Beard Trim", barber: "Devon K.", barberImg: "/images/barber-3.jpg", time: "9:30 AM", price: 15, status: "completed" },
  { id: "B003", client: "Sam Torres", service: "Classic Cut", barber: "Liam T.", barberImg: "/images/barber-4.jpg", time: "10:00 AM", price: 25, status: "in-progress" },
  { id: "B004", client: "Mia Chen", service: "Hair Color", barber: "Sofia R.", barberImg: "/images/barber-2.jpg", time: "11:00 AM", price: 60, status: "upcoming" },
  { id: "B005", client: "Jordan Lee", service: "Full Package", barber: "Marcus J.", barberImg: "/images/barber-1.jpg", time: "12:00 PM", price: 55, status: "upcoming" },
  { id: "B006", client: "Casey Brown", service: "Hot Towel Shave", barber: "Devon K.", barberImg: "/images/barber-3.jpg", time: "1:00 PM", price: 30, status: "upcoming" },
  { id: "B007", client: "Taylor Scott", service: "Skin Fade", barber: "Liam T.", barberImg: "/images/barber-4.jpg", time: "2:00 PM", price: 35, status: "cancelled" },
  { id: "B008", client: "Drew Evans", service: "Classic Cut", barber: "Sofia R.", barberImg: "/images/barber-2.jpg", time: "3:00 PM", price: 25, status: "upcoming" },
]

const STATUS_CONFIG = {
  completed: { label: "Done", icon: CheckCircle, cls: "text-brand bg-brand/10" },
  "in-progress": { label: "Active", icon: Clock, cls: "text-gold bg-gold/10" },
  upcoming: { label: "Upcoming", icon: AlertCircle, cls: "text-blue-400 bg-blue-500/10" },
  cancelled: { label: "Cancelled", icon: XCircle, cls: "text-red-400 bg-red-500/10" },
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card px-3 py-2 text-xs">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }} className="font-semibold">
            {p.name === "revenue" ? `$${p.value.toLocaleString()}` : p.value}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function AdminDashboard() {
  const [tableFilter, setTableFilter] = useState<string>("all")

  const filteredBookings = tableFilter === "all"
    ? TODAY_BOOKINGS
    : TODAY_BOOKINGS.filter((b) => b.status === tableFilter)

  const todayRevenue = TODAY_BOOKINGS
    .filter((b) => b.status !== "cancelled")
    .reduce((acc, b) => acc + b.price, 0)

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 pt-24 pb-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-brand text-xs font-semibold tracking-widest uppercase mb-1">Admin Panel</p>
            <h1 className="font-display font-bold text-3xl text-foreground">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">Friday, April 11, 2026</p>
          </div>
          <Link
            href="/admin/ml"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand/10 border border-brand/20 text-brand text-sm font-semibold hover:bg-brand/20 transition-all"
          >
            <Brain className="w-4 h-4" />
            ML Predictor
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {METRIC_CARDS.map((card, i) => (
            <div key={i} className="bento-card hover:border-brand/20 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", card.bgColor)}>
                  <card.icon className={cn("w-5 h-5", card.color)} />
                </div>
                <span className={cn(
                  "flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full",
                  card.positive ? "text-brand bg-brand/10" : "text-red-400 bg-red-500/10"
                )}>
                  {card.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {card.change}
                </span>
              </div>
              <p className="font-display font-bold text-3xl text-foreground">{card.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{card.title}</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-4 mb-6">
          <div className="lg:col-span-2 bento-card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-display font-bold text-lg text-foreground">Revenue Trend</h3>
                <p className="text-sm text-muted-foreground">Last 6 months</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-brand"><span className="w-3 h-0.5 rounded bg-brand inline-block" />Revenue</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={REVENUE_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="month" tick={{ fill: "#888", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#888", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#4ade80"
                  strokeWidth={2.5}
                  dot={{ fill: "#4ade80", strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: "#4ade80" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bento-card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-display font-bold text-lg text-foreground">Top Services</h3>
                <p className="text-sm text-muted-foreground">This month</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={SERVICE_DATA} layout="vertical">
                <XAxis type="number" tick={{ fill: "#888", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: "#ccc", fontSize: 11 }} axisLine={false} tickLine={false} width={45} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#4ade80" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { name: "Marcus J.", img: "/images/barber-1.jpg", role: "Senior Barber", status: "busy", today: 5, rating: 4.9 },
            { name: "Sofia R.", img: "/images/barber-2.jpg", role: "Color Specialist", status: "available", today: 3, rating: 4.8 },
            { name: "Devon K.", img: "/images/barber-3.jpg", role: "Beard Expert", status: "busy", today: 4, rating: 4.9 },
            { name: "Liam T.", img: "/images/barber-4.jpg", role: "Junior Barber", status: "break", today: 2, rating: 4.7 },
          ].map((staff, i) => (
            <div key={i} className="bento-card hover:border-brand/20 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0">
                  <Image src={staff.img} alt={staff.name} fill className="object-cover" />
                  <div className={cn(
                    "absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card",
                    staff.status === "available" ? "bg-brand" :
                    staff.status === "busy" ? "bg-gold" : "bg-muted-foreground"
                  )} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{staff.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{staff.role}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{staff.today} bookings today</span>
                <span className="text-gold font-medium">★ {staff.rating}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="bento-card p-0 overflow-hidden">
          <div className="px-6 py-5 border-b border-border-solid flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-lg text-foreground">{"Today's"} Bookings</h3>
              <p className="text-sm text-muted-foreground">${todayRevenue} total revenue today</p>
            </div>
            <div className="flex items-center gap-2">
              {["all", "in-progress", "upcoming", "completed", "cancelled"].map((f) => (
                <button
                  key={f}
                  onClick={() => setTableFilter(f)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all",
                    tableFilter === f
                      ? "bg-brand/10 text-brand border border-brand/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-solid">
                  {["ID", "Client", "Service", "Barber", "Time", "Status", "Price", ""].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((b, i) => {
                  const s = STATUS_CONFIG[b.status as keyof typeof STATUS_CONFIG]
                  return (
                    <tr
                      key={b.id}
                      className={cn(
                        "hover:bg-surface-elevated/50 transition-colors",
                        i < filteredBookings.length - 1 && "border-b border-border-solid"
                      )}
                    >
                      <td className="px-5 py-4 text-xs text-muted-foreground font-mono">{b.id}</td>
                      <td className="px-5 py-4 text-sm font-medium text-foreground whitespace-nowrap">{b.client}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-brand/10 flex items-center justify-center flex-shrink-0">
                            <Scissors className="w-3 h-3 text-brand" />
                          </div>
                          <span className="text-sm text-foreground whitespace-nowrap">{b.service}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="relative w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                            <Image src={b.barberImg} alt={b.barber} fill className="object-cover" />
                          </div>
                          <span className="text-sm text-muted-foreground whitespace-nowrap">{b.barber}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground whitespace-nowrap">{b.time}</td>
                      <td className="px-5 py-4">
                        <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold", s.cls)}>
                          <s.icon className="w-3 h-3" />
                          {s.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-foreground">${b.price}</td>
                      <td className="px-5 py-4">
                        <button className="text-muted-foreground hover:text-foreground transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
