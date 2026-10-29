import raw from "@/data/frontiercode.json"

export type Effort = string
export type LabGroup = "OpenAI" | "Anthropic" | "Other labs"
export type Confidence = "high" | "medium" | "low"
export type PlanKind = "lab" | "tool"
export type GlmScenario = "peak" | "mid" | "offpeak"

export interface EffortResult {
  effort: Effort
  score: number
  apiCost: number
  outputTokens: number | null
  harness: string | null
  /** Who ran it: "Cognition" or "Artificial Analysis". */
  source: string
  estimated?: boolean
}

export interface ModelMeta {
  id: string
  name: string
  short: string
  lab: string
  pricingId: string | null
  superseded: boolean
  openWeights: boolean
  api: { usdPerMtok: number; basis: "metered" | "list" | "implied" | "estimated"; note: string } | null
}

/** A model with its results on the active benchmark. */
export interface Model extends ModelMeta {
  efforts: EffortResult[]
}

export interface Benchmark {
  id: string
  name: string
  detail: string
  scoreLabel: string
  /** Appended to scores: "%" for pass rates, "" for index points. */
  scoreUnit: string
  source: { name: string; url: string; fetched?: string }
  results: Record<string, EffortResult[]>
  /** API prices that replace a model's default where this benchmark's costs use a different list price. */
  apiPrices?: Record<string, ModelMeta["api"]>
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

/** Shared Codex usage resets from Reset Beacon, and the allowance multiplier they imply for OpenAI's plans. */
export interface CodexResets {
  fetched: string
  url: string
  windowDays: number
  /** Plan providers whose allowance the resets refill. */
  providers: string[]
  /** Days (Pacific) with a confirmed reset inside the window. */
  dates: string[]
  avgGapDays: number | null
  /** 7 ÷ average gap, at least 1: weekly allowances per week for a subscriber who uses them all. */
  multiplier: number
}

export interface Dataset {
  generatedAt: string
  sources: Record<"pricing" | "reference", { name: string; url: string; snapshot?: string }>
  /** USD → currency multipliers (ECB reference rates) for the display-currency select. */
  fx: { date: string; source: string; rates: Record<string, number> }
  benchmarks: Benchmark[]
  models: ModelMeta[]
  codexResets: CodexResets
  plans: Plan[]
}

export const data = raw as Dataset

export const DEFAULT_BENCHMARK = data.benchmarks[0].id

/** Snapshot date of each data source that records one (ISO dates). */
export const SOURCE_DATES: { name: string; date: string }[] = [
  ...data.benchmarks.flatMap((b) => (b.source.fetched ? [{ name: b.name, date: b.source.fetched }] : [])),
  ...(data.sources.pricing.snapshot ? [{ name: "Plan allowances", date: data.sources.pricing.snapshot }] : []),
  { name: "Codex resets", date: data.codexResets.fetched },
  { name: "Exchange rates", date: data.fx.date },
]

/** When the data was last refreshed: the newest source snapshot. */
export const LAST_UPDATED = SOURCE_DATES.map((s) => s.date).sort().at(-1)!

export const benchmarkById = (id: string): Benchmark => data.benchmarks.find((b) => b.id === id) ?? data.benchmarks[0]

const modelsByBenchmark = new Map(
  data.benchmarks.map((b) => [
    b.id,
    data.models.filter((m) => b.results[m.id]?.length).map((m): Model => ({ ...m, api: b.apiPrices?.[m.id] ?? m.api, efforts: b.results[m.id] })),
  ]),
)

/**
 * Models that have results on a benchmark, each carrying those results as `efforts`.
 * Built once per benchmark, so the array keeps a stable identity for memoised consumers.
 */
export const modelsFor = (benchmarkId: string): readonly Model[] => modelsByBenchmark.get(benchmarkById(benchmarkId).id)!

export const EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "na"]

export const labGroup = (model: Pick<ModelMeta, "lab">): LabGroup =>
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
