import raw from "@/data/frontiercode.json"

export type Effort = string
export type LabGroup = "OpenAI" | "Anthropic" | "Other labs"
export type Confidence = "high" | "medium" | "low"
export type PlanKind = "lab" | "tool"
export type GlmScenario = "peak" | "mid" | "offpeak"

export interface EffortResult {
  effort: Effort
  score: number
  passRate: number | null
  flaggedRate: number | null
  apiCost: number
  outputTokens: number | null
}

export interface Model {
  id: string
  name: string
  short: string
  lab: string
  harness: string | null
  pricingId: string | null
  superseded: boolean
  openWeights: boolean
  api: { usdPerMtok: number; basis: "metered" | "list" | "implied" | "estimated"; note: string } | null
  efforts: EffortResult[]
}

export interface Offer {
  modelId: string
  usdPerMtok: number
  unmetered: boolean
  promoUntil: string | null
  confidence: Confidence
  dataDate: string | null
  source: string
}

export interface Plan {
  id: string
  name: string
  provider: string
  kind: PlanKind
  scenario: GlmScenario | null
  group: string
  fee: number
  localPrice: string | null
  offers: Offer[]
}

export interface Dataset {
  generatedAt: string
  sources: Record<"benchmark" | "pricing" | "reference", { name: string; url: string; snapshot?: string }>
  models: Model[]
  plans: Plan[]
}

export const data = raw as Dataset

export const EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "na"]

export const labGroup = (model: Model): LabGroup =>
  model.lab === "OpenAI" ? "OpenAI" : model.lab === "Anthropic" ? "Anthropic" : "Other labs"

/** Monthly-fee brackets used by the bracket toggles. Bounds are inclusive. */
export const BRACKETS = [
  { id: "entry", label: "≤ $20", hint: "Pro / Plus tier", min: 0, max: 20 },
  { id: "mid", label: "$21–60", hint: "Mid tier", min: 20.01, max: 60 },
  { id: "5x", label: "$61–150", hint: "5x tier", min: 60.01, max: 150 },
  { id: "20x", label: "$151–250", hint: "20x tier", min: 150.01, max: 250 },
  { id: "heavy", label: "$250+", hint: "Heavy", min: 250.01, max: Infinity },
] as const
export type BracketId = (typeof BRACKETS)[number]["id"]

export const bracketOf = (fee: number): BracketId => BRACKETS.find((b) => fee >= b.min && fee <= b.max)!.id

export const MAX_FEE = Math.max(...data.plans.map((p) => p.fee))
