"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Brain, ChevronRight, Check, Sparkles, TrendingUp,
  Award, DollarSign, Target, RefreshCw, ChevronLeft, GraduationCap,
  Clock, AlertTriangle, Zap,
} from "lucide-react"
import Link from "next/link"
import { Navbar } from "@/components/barberhub/navbar"
import { cn } from "@/lib/utils"
import {
  RadarChart, PolarGrid, PolarAngleAxis,
  Radar, ResponsiveContainer,
} from "recharts"

// ── Skill definitions must match ml/evaluator.py ──────────────────────────────
const SKILLS = [
  // Foundation
  { id: "classic",     label: "Classic Haircut",     category: "basic"    },
  { id: "machine",     label: "Clipper Cut",          category: "basic"    },
  // Core Techniques
  { id: "fade",        label: "Fade & Taper",         category: "advanced" },
  { id: "beard",       label: "Beard Sculpting",      category: "advanced" },
  { id: "razor",       label: "Straight Razor",       category: "advanced" },
  { id: "scissors",    label: "Long Haircut",         category: "advanced" },
  { id: "hair_tattoo", label: "Hair Tattoo",          category: "advanced" },
  { id: "waxing",      label: "Waxing",               category: "advanced" },
  { id: "black_mask",  label: "Face Treatment",       category: "advanced" },
  // Specialist Services
  { id: "coloring",    label: "Hair Coloring",        category: "expert"   },
  { id: "correction",  label: "Color Correction",     category: "expert"   },
  { id: "extensions",  label: "Hair Extensions",      category: "expert"   },
  { id: "camouflage",  label: "Hair Camouflage",      category: "expert"   },
  { id: "perm",        label: "Chemical Perm",        category: "expert"   },
  // Client Services
  { id: "consulting",  label: "Style Consulting",     category: "soft"     },
  { id: "products",    label: "Product Knowledge",    category: "soft"     },
]

const SKILL_CATEGORIES = [
  { id: "basic",    label: "Foundation",      color: "text-brand",      desc: "weight ×1" },
  { id: "advanced", label: "Core Techniques", color: "text-gold",       desc: "weight ×3" },
  { id: "expert",   label: "Specialist",      color: "text-purple-400", desc: "weight ×5" },
  { id: "soft",     label: "Client Services", color: "text-sky-400",    desc: "weight ×2" },
]

// ── Average service time per standard haircut (fade / clipper — not coloring) ─
// Real Kazakhstan barbershop benchmarks 2024-2025
const SERVICE_TIMES = [
  { id: "fast",     label: "Express",  desc: "≤ 30 мин",    hint: "8-10 клиентов/день", score: 100, color: "text-brand"      },
  { id: "normal",   label: "Standard", desc: "30 – 50 мин", hint: "6-8 клиентов/день",  score:  75, color: "text-gold"       },
  { id: "thorough", label: "Moderate", desc: "50 – 75 мин", hint: "4-6 клиентов/день",  score:  45, color: "text-orange-400" },
  { id: "slow",     label: "Slow",     desc: "> 75 мин",    hint: "≤ 4 клиента/день",   score:  15, color: "text-red-400"    },
] as const

type ServiceTimeId = typeof SERVICE_TIMES[number]["id"]

// ── API response type (snake_case matches FastAPI) ────────────────────────────
type PredictionResult = {
  role:            string
  level:           string
  confidence:      number
  salary_min:      number
  salary_max:      number
  salary_currency: string
  salary_period:   string
  reasoning:       string[]
  radar_data:      { skill: string; value: number }[]
  next_level:      string | null
  tips:            string[]
}

export default function MLPredictorPage() {
  const router = useRouter()

  // Only owner/admin/staff may access this page.
  useEffect(() => {
    const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null
    const token   = typeof window !== "undefined" ? localStorage.getItem("token") : null
    if (!token || !userStr) { router.replace("/login"); return }
    try {
      const u = JSON.parse(userStr)
      if (u.role === "client") router.replace("/")
    } catch {
      router.replace("/login")
    }
  }, [router])

  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [experience,     setExperience]     = useState("1-3")
  const [educationCount, setEducationCount] = useState(0)
  const [serviceTime,    setServiceTime]    = useState<ServiceTimeId>("normal")
  const [recencyRatio,   setRecencyRatio]   = useState(0.5)
  const [loading,        setLoading]        = useState(false)
  const [result,         setResult]         = useState<PredictionResult | null>(null)
  const [error,          setError]          = useState<string | null>(null)
  const [animatedConf,   setAnimatedConf]   = useState(0)

  // ── Derived values ────────────────────────────────────────────────────────
  const hasFoundation      = selectedSkills.some(s => s === "classic" || s === "machine")
  // Recency coefficient: older courses (0%) count half; fully recent (100%) count fully
  const effectiveEducation = Math.round(educationCount * (0.5 + 0.5 * recencyRatio))
  const activeSvcTime      = SERVICE_TIMES.find(t => t.id === serviceTime)!
  const effScore           = activeSvcTime.score
  const effColor           = activeSvcTime.color

  const toggleSkill = (id: string) =>
    setSelectedSkills(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )

  // ── Animate confidence ring on result change ──────────────────────────────
  useEffect(() => {
    if (!result) return
    let current = 0
    const target = result.confidence
    const step   = target / 60
    const timer  = setInterval(() => {
      current += step
      if (current >= target) { setAnimatedConf(target); clearInterval(timer) }
      else setAnimatedConf(Math.floor(current))
    }, 16)
    return () => clearInterval(timer)
  }, [result])

  const R             = 54
  const circumference = 2 * Math.PI * R
  const dashOffset    = result
    ? circumference - (animatedConf / 100) * circumference
    : circumference

  // ── Call real ML backend ──────────────────────────────────────────────────
  const handleAnalyze = async () => {
    setLoading(true)
    setResult(null)
    setError(null)
    setAnimatedConf(0)
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const res = await fetch(`${apiBase}/ml/evaluate-barber`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          years_experience_cat: experience,
          skills:               selectedSkills,
          education_count:      effectiveEducation, // recency-adjusted
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Server error ${res.status}`)
      }
      const data: PredictionResult = await res.json()
      setResult(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Prediction failed. Is the API server running?")
    } finally {
      setLoading(false)
    }
  }

  const isUnqualified = result?.level === "Unqualified"

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 pt-24 pb-16">
        {/* Breadcrumb */}
        <div className="flex items-center gap-3 mb-2">
          <Link
            href="/partner/dashboard"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Dashboard
          </Link>
          <span className="text-border-solid">/</span>
          <span className="text-sm text-foreground">ML Staff Grader</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-8 mt-4">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-purple-400" />
              </div>
              <h1 className="font-display font-bold text-3xl text-foreground">
                ML Staff Grader
              </h1>
            </div>
            <p className="text-muted-foreground max-w-lg">
              Select a barber&apos;s skills, experience, and completed courses
              to predict their professional level and salary range using a
              trained RandomForest classifier.
            </p>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid lg:grid-cols-2 gap-6">

          {/* ── LEFT: Input Form ─────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Skills */}
            <div className="bento-card">
              <h2 className="font-display font-bold text-lg text-foreground mb-1">
                Barber Skills
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                Select all skills this barber can perform
              </p>

              <div className="space-y-5">
                {SKILL_CATEGORIES.map(cat => (
                  <div key={cat.id}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <p className={cn("text-xs font-semibold uppercase tracking-widest", cat.color)}>
                        {cat.label}
                      </p>
                      <span className="text-xs text-muted-foreground">({cat.desc})</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {SKILLS.filter(s => s.category === cat.id).map(skill => {
                        const on = selectedSkills.includes(skill.id)
                        return (
                          <button
                            key={skill.id}
                            onClick={() => toggleSkill(skill.id)}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all",
                              on
                                ? "border-brand bg-brand/10 text-brand"
                                : "border-border-solid bg-surface text-muted-foreground hover:text-foreground hover:border-brand/30"
                            )}
                          >
                            {on && <Check className="w-3 h-3" />}
                            {skill.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Foundation qualifier warning */}
              {selectedSkills.length > 0 && !hasFoundation && (
                <div className="mt-4 flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/40 bg-amber-500/5">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-400 leading-relaxed">
                    <span className="font-semibold">Foundation required:</span>{" "}
                    a barber must know at least Classic Haircut or Clipper Cut —
                    without foundation skills the model will return &quot;Not Qualified&quot;.
                  </p>
                </div>
              )}
            </div>

            {/* Experience */}
            <div className="bento-card">
              <h2 className="font-display font-bold text-lg text-foreground mb-1">
                Years of Experience
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                How long has this barber been working professionally?
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {(["0", "1-3", "3-5", "5-10", "10+"] as const).map(yr => (
                  <button
                    key={yr}
                    onClick={() => setExperience(yr)}
                    className={cn(
                      "py-3 rounded-xl border text-sm font-bold transition-all",
                      experience === yr
                        ? "border-brand bg-brand/10 text-brand brand-glow-sm"
                        : "border-border-solid bg-surface text-muted-foreground hover:border-brand/30 hover:text-foreground"
                    )}
                  >
                    {yr}
                    <span className="block text-xs font-normal mt-0.5 opacity-70">yrs</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Education + Recency */}
            <div className="bento-card">
              <h2 className="font-display font-bold text-lg text-foreground mb-1 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-purple-400" />
                Completed Courses
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                How many professional courses has this barber completed?
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                  <button
                    key={n}
                    onClick={() => setEducationCount(n)}
                    className={cn(
                      "py-3 rounded-xl border text-sm font-bold transition-all",
                      educationCount === n
                        ? "border-purple-400 bg-purple-400/10 text-purple-400"
                        : "border-border-solid bg-surface text-muted-foreground hover:border-purple-400/30 hover:text-foreground"
                    )}
                  >
                    {n === 7 ? "7+" : n}
                    <span className="block text-xs font-normal mt-0.5 opacity-70">crs</span>
                  </button>
                ))}
              </div>

              {/* Recency slider — visible when at least 1 course selected */}
              {educationCount > 0 && (
                <div className="mt-5 pt-4 border-t border-border-solid">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Course Recency</span>
                    <span className="text-sm font-semibold text-purple-400">
                      {Math.round(recencyRatio * 100)}% recent
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0} max={1} step={0.1}
                    value={recencyRatio}
                    onChange={e => setRecencyRatio(Number(e.target.value))}
                    className="w-full accent-purple-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Older courses</span>
                    <span>All recent</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Effective weight:{" "}
                    <span className="text-purple-400 font-semibold">
                      {effectiveEducation} course{effectiveEducation !== 1 ? "s" : ""}
                    </span>{" "}
                    — courses completed recently carry more weight than outdated ones
                  </p>
                </div>
              )}
            </div>

            {/* Average Service Time */}
            <div className="bento-card">
              <h2 className="font-display font-bold text-lg text-foreground mb-1 flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-400" />
                Avg Service Time
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Среднее время стандартной стрижки (фейд / машинка).
                Окрашивание и коррекция не считаются — они дольше по природе.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {SERVICE_TIMES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setServiceTime(t.id)}
                    className={cn(
                      "flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left transition-all",
                      serviceTime === t.id
                        ? "border-orange-400/60 bg-orange-400/10"
                        : "border-border-solid bg-surface hover:border-orange-400/30"
                    )}
                  >
                    <span className={cn(
                      "text-sm font-semibold",
                      serviceTime === t.id ? t.color : "text-foreground"
                    )}>
                      {t.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{t.desc}</span>
                    <span className="text-xs text-muted-foreground/60">{t.hint}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                <Zap className="w-3 h-3" />
                Shown as Business Efficiency — does not affect the ML prediction
              </p>
            </div>

            {/* Run button */}
            <button
              onClick={handleAnalyze}
              disabled={selectedSkills.length === 0 || loading}
              className={cn(
                "w-full flex items-center justify-center gap-3 py-4 rounded-xl font-semibold text-base transition-all",
                selectedSkills.length === 0
                  ? "bg-surface border border-border-solid text-muted-foreground cursor-not-allowed"
                  : "bg-brand text-brand-foreground hover:bg-brand/90 brand-glow"
              )}
            >
              {loading ? (
                <>
                  <span className="w-5 h-5 border-2 border-brand-foreground/30 border-t-brand-foreground rounded-full animate-spin" />
                  Running ML model...
                </>
              ) : (
                <>
                  <Brain className="w-5 h-5" />
                  Run ML Analysis
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>

            {selectedSkills.length > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                {selectedSkills.length} skill{selectedSkills.length !== 1 ? "s" : ""} ·{" "}
                {experience} yrs experience ·{" "}
                {effectiveEducation} course{effectiveEducation !== 1 ? "s" : ""}
                {educationCount > 0 && recencyRatio < 1
                  ? ` (${Math.round(recencyRatio * 100)}% recent)`
                  : ""}
              </p>
            )}
          </div>

          {/* ── RIGHT: Results ───────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Empty state */}
            {!result && !loading && !error && (
              <div className="bento-card flex flex-col items-center justify-center py-20 text-center border-dashed border-border-solid">
                <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-purple-400/50" />
                </div>
                <p className="font-display font-bold text-lg text-foreground mb-2">
                  No Analysis Yet
                </p>
                <p className="text-muted-foreground text-sm max-w-xs">
                  Select skills and experience on the left, then click
                  &quot;Run ML Analysis&quot; to get a prediction.
                </p>
              </div>
            )}

            {/* Error state */}
            {error && !loading && (
              <div className="bento-card border-destructive/30 bg-destructive/5 py-10 text-center">
                <p className="font-bold text-destructive mb-2">Prediction Failed</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div className="bento-card py-20 flex flex-col items-center justify-center gap-5">
                <div className="w-16 h-16 rounded-full border-2 border-brand/20 border-t-brand animate-spin" />
                <div className="text-center">
                  <p className="font-display font-bold text-lg text-foreground">
                    Processing Skills...
                  </p>
                  <p className="text-muted-foreground text-sm mt-1">
                    Running inference on ML model
                  </p>
                </div>
                <div className="w-full max-w-sm space-y-3 mt-4">
                  {[80, 60, 70, 50].map((w, i) => (
                    <div
                      key={i}
                      className="h-3 rounded-full bg-surface-elevated animate-pulse"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Result */}
            {result && !loading && (
              <>
                {/* ── Not Qualified ──────────────────────────────────────── */}
                {isUnqualified ? (
                  <div className="bento-card border-amber-500/30 bg-amber-500/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="w-6 h-6 text-amber-500" />
                      </div>
                      <div>
                        <p className="font-display font-bold text-xl text-amber-400 mb-1">
                          Not Qualified
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Foundation skills are missing. A barber must know at least
                          Classic Haircut or Clipper Cut before any professional level
                          can be assigned.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Qualified: role prediction card ─────────────────── */
                  <div className="bento-card border-brand/20 bg-gradient-to-br from-brand/8 to-surface animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-start gap-5">
                      {/* Confidence ring */}
                      <div className="flex-shrink-0 relative">
                        <svg width="128" height="128" viewBox="0 0 128 128">
                          <circle cx="64" cy="64" r={R} fill="none"
                            stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                          <circle cx="64" cy="64" r={R} fill="none"
                            stroke="#4ade80" strokeWidth="8" strokeLinecap="round"
                            strokeDasharray={circumference} strokeDashoffset={dashOffset}
                            className="transition-all duration-100"
                            style={{ filter: "drop-shadow(0 0 8px rgba(74,222,128,0.4))" }}
                          />
                          <text x="64" y="60" textAnchor="middle" fill="#4ade80"
                            fontSize="22" fontWeight="800">
                            {animatedConf}%
                          </text>
                          <text x="64" y="78" textAnchor="middle" fill="#888" fontSize="9">
                            CONFIDENCE
                          </text>
                        </svg>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Award className="w-4 h-4 text-gold" />
                          <span className="text-xs text-gold font-semibold uppercase tracking-wide">
                            {result.level}
                          </span>
                        </div>
                        <h2 className="font-display font-bold text-3xl text-foreground mb-1 text-balance">
                          {result.role}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Predicted by BarberHub ML · RandomForest
                        </p>

                        {/* Salary — KZT/month */}
                        <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-surface-elevated border border-border-solid">
                          <DollarSign className="w-4 h-4 text-brand" />
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Estimated Salary · Kazakhstan Market
                            </p>
                            <p className="font-display font-bold text-lg text-foreground">
                              {result.salary_min.toLocaleString()} –{" "}
                              {result.salary_max.toLocaleString()} ₸
                              <span className="text-xs font-normal text-muted-foreground ml-1">
                                /{result.salary_period ?? "month"}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Business Efficiency card (always shown with result) */}
                <div className="bento-card animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
                  <h3 className="font-display font-bold text-base text-foreground mb-3 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-orange-400" />
                    Business Efficiency
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Время стрижки</span>
                      <span className={cn("text-sm font-semibold", effColor)}>
                        {activeSvcTime.label} · {activeSvcTime.desc}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground/70">{activeSvcTime.hint}</p>
                    <div className="w-full h-2.5 bg-surface-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${effScore}%`,
                          background:
                            effScore >= 80 ? "#4ade80" :
                            effScore >= 50 ? "#fbbf24" :
                            effScore >= 30 ? "#f97316" : "#f87171",
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {effScore >= 80
                        ? "Высокий поток — идеально для загруженного барбершопа"
                        : effScore >= 60
                        ? "Хороший баланс скорости и качества"
                        : effScore >= 35
                        ? "Ниже среднего — рассмотри оптимизацию рабочего процесса"
                        : "Низкая проходимость — влияет на выручку и очередь клиентов"}
                    </p>
                  </div>
                </div>

                {/* Analysis reasoning */}
                <div className="bento-card animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                  <h3 className="font-display font-bold text-base text-foreground mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4 text-brand" />
                    Analysis Reasoning
                  </h3>
                  <div className="space-y-2.5">
                    {result.reasoning.map((r, i) => {
                      const isWarning = r.startsWith("⚠️")
                      return (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className={cn(
                            "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                            isWarning ? "bg-amber-500/15" : "bg-brand/15"
                          )}>
                            {isWarning
                              ? <AlertTriangle className="w-3 h-3 text-amber-500" />
                              : <Check className="w-3 h-3 text-brand" />}
                          </div>
                          <p className={cn(
                            "text-sm",
                            isWarning ? "text-amber-400" : "text-muted-foreground"
                          )}>
                            {isWarning ? r.replace("⚠️ ", "") : r}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Path to next level / Top achieved / How to qualify */}
                <div className="bento-card animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
                  <h3 className="font-display font-bold text-base text-foreground mb-3 flex items-center gap-2">
                    <ChevronRight className={cn(
                      "w-4 h-4",
                      isUnqualified ? "text-amber-500" : "text-gold"
                    )} />
                    {isUnqualified
                      ? "How to Qualify"
                      : result.next_level
                      ? `Path to ${result.next_level}`
                      : "Top Level Achieved!"}
                  </h3>
                  <div className="space-y-2.5">
                    {result.tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                          isUnqualified ? "bg-amber-500/15" : "bg-gold/15"
                        )}>
                          <span className={cn(
                            "text-xs font-bold",
                            isUnqualified ? "text-amber-500" : "text-gold"
                          )}>
                            {i + 1}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{tip}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Skill radar */}
                <div className="bento-card animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
                  <h3 className="font-display font-bold text-base text-foreground mb-1 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-brand" />
                    Skill Profile
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Proficiency across all evaluation dimensions
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <RadarChart data={result.radar_data}>
                      <PolarGrid stroke="rgba(255,255,255,0.06)" />
                      <PolarAngleAxis
                        dataKey="skill"
                        tick={{ fill: "#888", fontSize: 11 }}
                      />
                      <Radar
                        name="Profile"
                        dataKey="value"
                        stroke="#4ade80"
                        fill="#4ade80"
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Re-run */}
                <button
                  onClick={() => { setResult(null); setError(null) }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border-solid text-muted-foreground text-sm hover:text-foreground hover:bg-surface-elevated transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                  Run New Analysis
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
