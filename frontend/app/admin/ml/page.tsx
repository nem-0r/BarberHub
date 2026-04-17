"use client"

import { useState, useEffect } from "react"
import { Brain, ChevronRight, Check, Sparkles, TrendingUp, Award, DollarSign, Target, RefreshCw, ChevronLeft } from "lucide-react"
import Link from "next/link"
import { Navbar } from "@/components/barberhub/navbar"
import { cn } from "@/lib/utils"
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from "recharts"

const SKILLS = [
  { id: "fade", label: "Fade & Taper", category: "cuts" },
  { id: "scissor", label: "Scissor Work", category: "cuts" },
  { id: "design", label: "Hair Design / Art", category: "cuts" },
  { id: "shave", label: "Straight Razor Shave", category: "shave" },
  { id: "beard_sculpt", label: "Beard Sculpting", category: "shave" },
  { id: "color", label: "Hair Coloring", category: "color" },
  { id: "highlights", label: "Highlights / Balayage", category: "color" },
  { id: "customer", label: "Customer Relations", category: "soft" },
  { id: "upsell", label: "Upselling & Retail", category: "soft" },
  { id: "mentor", label: "Staff Mentoring", category: "soft" },
  { id: "manage", label: "Shift Management", category: "manage" },
  { id: "inventory", label: "Inventory Control", category: "manage" },
]

const SKILL_CATEGORIES = [
  { id: "cuts", label: "Cutting Techniques", color: "text-brand" },
  { id: "shave", label: "Shaving & Beard", color: "text-gold" },
  { id: "color", label: "Color Services", color: "text-purple-400" },
  { id: "soft", label: "Soft Skills", color: "text-blue-400" },
  { id: "manage", label: "Management", color: "text-pink-400" },
]

type PredictionResult = {
  role: string
  level: string
  salaryMin: number
  salaryMax: number
  confidence: number
  reasoning: string[]
  radarData: { skill: string; value: number }[]
}

function getPrediction(skills: string[], experience: string): PredictionResult {
  const expYears = parseInt(experience, 10)
  const skillCount = skills.length
  const hasManage = skills.includes("manage") || skills.includes("inventory")
  const hasMentor = skills.includes("mentor")
  const hasColor = skills.includes("color") || skills.includes("highlights")
  const hasFade = skills.includes("fade")

  let role = "Junior Barber"
  let level = "Entry Level"
  let salaryMin = 28000
  let salaryMax = 38000
  let confidence = 76

  if (expYears >= 8 && (hasManage || hasMentor) && skillCount >= 8) {
    role = "Master Barber"
    level = "Expert Level"
    salaryMin = 72000
    salaryMax = 98000
    confidence = 96
  } else if (expYears >= 5 && skillCount >= 7) {
    role = "Senior Barber"
    level = "Advanced Level"
    salaryMin = 52000
    salaryMax = 70000
    confidence = 92
  } else if (expYears >= 3 && skillCount >= 5) {
    role = "Specialist Barber"
    level = hasColor ? "Color Specialist" : hasFade ? "Fade Specialist" : "Mid Level"
    salaryMin = 40000
    salaryMax = 55000
    confidence = 87
  } else if (expYears >= 1 && skillCount >= 3) {
    role = "Barber"
    level = "Mid Level"
    salaryMin = 34000
    salaryMax = 46000
    confidence = 82
  }

  const reasoning = [
    `${expYears} years of experience detected`,
    `${skillCount} skills selected across ${new Set(skills.map(s => SKILLS.find(sk => sk.id === s)?.category)).size} categories`,
    hasManage ? "Leadership/management skills detected" : "No management role detected",
    hasMentor ? "Mentoring capability adds seniority" : null,
    hasColor ? "Color services command premium pay" : null,
  ].filter(Boolean) as string[]

  const radarData = [
    { skill: "Cuts", value: [skills.includes("fade"), skills.includes("scissor"), skills.includes("design")].filter(Boolean).length * 33 },
    { skill: "Shave", value: [skills.includes("shave"), skills.includes("beard_sculpt")].filter(Boolean).length * 50 },
    { skill: "Color", value: [skills.includes("color"), skills.includes("highlights")].filter(Boolean).length * 50 },
    { skill: "Soft Skills", value: [skills.includes("customer"), skills.includes("upsell"), skills.includes("mentor")].filter(Boolean).length * 33 },
    { skill: "Management", value: [skills.includes("manage"), skills.includes("inventory")].filter(Boolean).length * 50 },
  ]

  return { role, level, salaryMin, salaryMax, confidence, reasoning, radarData }
}

export default function MLPredictorPage() {
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [experience, setExperience] = useState("3")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [animatedConfidence, setAnimatedConfidence] = useState(0)

  const toggleSkill = (id: string) => {
    setSelectedSkills((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  const handleAnalyze = () => {
    setLoading(true)
    setResult(null)
    setAnimatedConfidence(0)
    setTimeout(() => {
      const r = getPrediction(selectedSkills, experience)
      setResult(r)
      setLoading(false)
    }, 2200)
  }

  useEffect(() => {
    if (result) {
      let start = 0
      const target = result.confidence
      const step = target / 60
      const timer = setInterval(() => {
        start += step
        if (start >= target) {
          setAnimatedConfidence(target)
          clearInterval(timer)
        } else {
          setAnimatedConfidence(Math.floor(start))
        }
      }, 16)
      return () => clearInterval(timer)
    }
  }, [result])

  // Circular progress ring calculations
  const circleRadius = 54
  const circumference = 2 * Math.PI * circleRadius
  const progress = result ? (animatedConfidence / 100) * circumference : 0
  const strokeDashoffset = circumference - progress

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 pt-24 pb-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Link href="/admin" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
            Dashboard
          </Link>
          <span className="text-border-solid">/</span>
          <span className="text-sm text-foreground">ML Predictor</span>
        </div>

        <div className="flex items-start justify-between mb-8 mt-4">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-purple-400" />
              </div>
              <h1 className="font-display font-bold text-3xl text-foreground">ML Skill Predictor</h1>
            </div>
            <p className="text-muted-foreground max-w-lg">
              Input a barber&apos;s skills and experience to predict their optimal job role, estimated salary range, and ML confidence score.
            </p>
          </div>
        </div>

        {/* Split Screen Layout */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* LEFT: Input Form */}
          <div className="space-y-6">
            <div className="bento-card">
              <h2 className="font-display font-bold text-lg text-foreground mb-1">Barber Skills</h2>
              <p className="text-sm text-muted-foreground mb-5">Select all applicable skills</p>

              <div className="space-y-5">
                {SKILL_CATEGORIES.map((cat) => (
                  <div key={cat.id}>
                    <p className={cn("text-xs font-semibold uppercase tracking-widest mb-2.5", cat.color)}>
                      {cat.label}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {SKILLS.filter((s) => s.category === cat.id).map((skill) => {
                        const isSelected = selectedSkills.includes(skill.id)
                        return (
                          <button
                            key={skill.id}
                            onClick={() => toggleSkill(skill.id)}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all",
                              isSelected
                                ? "border-brand bg-brand/10 text-brand"
                                : "border-border-solid bg-surface text-muted-foreground hover:text-foreground hover:border-brand/30"
                            )}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                            {skill.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Experience Selector */}
            <div className="bento-card">
              <h2 className="font-display font-bold text-lg text-foreground mb-1">Years of Experience</h2>
              <p className="text-sm text-muted-foreground mb-4">How long has this barber been working professionally?</p>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {["1", "2", "3", "5", "8", "10+"].map((yr) => (
                  <button
                    key={yr}
                    onClick={() => setExperience(yr === "10+" ? "10" : yr)}
                    className={cn(
                      "py-3 rounded-xl border text-sm font-bold transition-all",
                      (experience === yr || (yr === "10+" && experience === "10"))
                        ? "border-brand bg-brand/10 text-brand brand-glow-sm"
                        : "border-border-solid bg-surface text-muted-foreground hover:border-brand/30 hover:text-foreground"
                    )}
                  >
                    {yr}
                    <span className="block text-xs font-normal mt-0.5 opacity-70">
                      {yr === "1" ? "yr" : "yrs"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Run Button */}
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
                  Analyzing with ML model...
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
                {selectedSkills.length} skill{selectedSkills.length !== 1 ? "s" : ""} selected · {experience} years experience
              </p>
            )}
          </div>

          {/* RIGHT: Output Result */}
          <div className="space-y-5">
            {!result && !loading && (
              <div className="bento-card flex flex-col items-center justify-center py-20 text-center border-dashed border-border-solid">
                <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-purple-400/50" />
                </div>
                <p className="font-display font-bold text-lg text-foreground mb-2">No Analysis Yet</p>
                <p className="text-muted-foreground text-sm max-w-xs">
                  Select skills and experience on the left, then click &quot;Run ML Analysis&quot; to get a prediction.
                </p>
              </div>
            )}

            {loading && (
              <div className="bento-card py-20 flex flex-col items-center justify-center gap-5">
                <div className="w-16 h-16 rounded-full border-2 border-brand/20 border-t-brand animate-spin" />
                <div className="text-center">
                  <p className="font-display font-bold text-lg text-foreground">Processing Skills...</p>
                  <p className="text-muted-foreground text-sm mt-1">Running inference on ML model</p>
                </div>
                {/* Loading skeleton */}
                <div className="w-full max-w-sm space-y-3 mt-4">
                  {[80, 60, 70, 50].map((w, i) => (
                    <div key={i} className={`h-3 rounded-full bg-surface-elevated animate-pulse`} style={{ width: `${w}%` }} />
                  ))}
                </div>
              </div>
            )}

            {result && !loading && (
              <>
                {/* Role Prediction Card */}
                <div className="bento-card border-brand/20 bg-gradient-to-br from-brand/8 to-surface animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-start gap-5">
                    {/* Circular Progress */}
                    <div className="flex-shrink-0 relative">
                      <svg width="128" height="128" viewBox="0 0 128 128">
                        {/* Background ring */}
                        <circle
                          cx="64" cy="64" r={circleRadius}
                          fill="none"
                          stroke="rgba(255,255,255,0.06)"
                          strokeWidth="8"
                        />
                        {/* Progress ring */}
                        <circle
                          cx="64" cy="64" r={circleRadius}
                          fill="none"
                          stroke="#4ade80"
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          className="progress-ring transition-all duration-100"
                          style={{ filter: "drop-shadow(0 0 8px rgba(74,222,128,0.4))" }}
                        />
                        <text x="64" y="60" textAnchor="middle" fill="#4ade80" fontSize="22" fontWeight="800">
                          {animatedConfidence}%
                        </text>
                        <text x="64" y="78" textAnchor="middle" fill="#888" fontSize="9">
                          CONFIDENCE
                        </text>
                      </svg>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Award className="w-4 h-4 text-gold" />
                        <span className="text-xs text-gold font-semibold uppercase tracking-wide">{result.level}</span>
                      </div>
                      <h2 className="font-display font-bold text-3xl text-foreground mb-1 text-balance">{result.role}</h2>
                      <p className="text-sm text-muted-foreground">Predicted by BarberHub ML v2.1</p>

                      <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-surface-elevated border border-border-solid">
                        <DollarSign className="w-4 h-4 text-brand" />
                        <div>
                          <p className="text-xs text-muted-foreground">Estimated Salary Range</p>
                          <p className="font-display font-bold text-lg text-foreground">
                            ${result.salaryMin.toLocaleString()} – ${result.salaryMax.toLocaleString()}
                            <span className="text-xs font-normal text-muted-foreground">/yr</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Analysis Reasoning */}
                <div className="bento-card animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                  <h3 className="font-display font-bold text-base text-foreground mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4 text-brand" />
                    Analysis Reasoning
                  </h3>
                  <div className="space-y-2.5">
                    {result.reasoning.map((r, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-brand/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-brand" />
                        </div>
                        <p className="text-sm text-muted-foreground">{r}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Radar Chart */}
                <div className="bento-card animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
                  <h3 className="font-display font-bold text-base text-foreground mb-1 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-brand" />
                    Skill Breakdown
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">Proficiency across all categories</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <RadarChart data={result.radarData}>
                      <PolarGrid stroke="rgba(255,255,255,0.06)" />
                      <PolarAngleAxis dataKey="skill" tick={{ fill: "#888", fontSize: 11 }} />
                      <Radar
                        name="Skills"
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
                  onClick={() => setResult(null)}
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
