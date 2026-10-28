import { bracketOf, data, EFFORT_ORDER, type BracketId, type GlmScenario, type Model, type Offer, type Plan, type PlanKind } from "@/lib/data"

export interface Filters {
  mode: "subscription" | "api"
  maxFee: number
  brackets: ReadonlySet<BracketId>
  kinds: ReadonlySet<PlanKind>
  disabledPlans: ReadonlySet<string>
  hideLowConfidence: boolean
  glmScenario: GlmScenario
  /** Reasoning-effort levels to keep; a model with none of them left drops out. */
  efforts: ReadonlySet<string>
  models: ReadonlySet<string>
}

export type PriceSource = "subscription" | "free" | "api"

export interface Row {
  key: string
  modelId: string
  model: Model
  effort: string
  score: number
  apiCost: number
  outputTokens: number | null
  harness: string | null
  /** Who ran the benchmark for this result. */
  ranBy: string
  /** Cost per task under the active pricing mode. 0 means unmetered. */
  cost: number
  source: PriceSource
  plan: Plan | null
  offer: Offer | null
}

/** Why a plan is or isn't in play, so the plan list can explain greyed-out rows. */
export function planExclusion(plan: Plan, f: Filters): string | null {
  if (plan.fee > f.maxFee) return "Over max monthly cost"
  if (!f.brackets.has(bracketOf(plan.fee))) return "Bracket hidden"
  if (!f.kinds.has(plan.kind)) return plan.kind === "tool" ? "Third-party tools hidden" : "Lab plans hidden"
  if (plan.scenario && plan.scenario !== f.glmScenario) return "Other time-of-day scenario"
  if (f.hideLowConfidence && plan.offers.every((o) => o.confidence === "low")) return "Low-confidence allowance"
  if (f.disabledPlans.has(plan.id)) return "Turned off"
  return null
}

/** Models whose allowance on this plan is only a low-confidence estimate. */
export function lowConfidenceModels(plan: Plan): string[] {
  return plan.offers.filter((o) => o.confidence === "low").map((o) => o.modelId)
}

/** Subscription cost of one task: API $/task scaled by the plan's share of list price, at full allowance use. */
export function taskCost(model: Model, apiCost: number, offer: Offer): number {
  if (offer.unmetered) return 0
  if (!model.api) return NaN
  return (apiCost * offer.usdPerMtok) / model.api.usdPerMtok
}

export interface PlanQuote {
  plan: Plan
  offer: Offer
  cost: number
  excludedBy: string | null
}

/** Every plan that serves a model, priced for one effort's API cost, cheapest first. */
export function quotesFor(model: Model, apiCost: number, f: Filters): PlanQuote[] {
  const quotes: PlanQuote[] = []
  for (const plan of data.plans) {
    const offer = plan.offers.find((o) => o.modelId === model.id)
    if (!offer) continue
    // GLM scenarios are three readings of one plan; only list the active one.
    if (plan.scenario && plan.scenario !== f.glmScenario) continue
    let excludedBy = planExclusion(plan, f)
    if (!excludedBy && f.hideLowConfidence && offer.confidence === "low") excludedBy = "Low-confidence estimate"
    quotes.push({ plan, offer, cost: taskCost(model, apiCost, offer), excludedBy })
  }
  return quotes.sort((a, b) => a.cost - b.cost || a.plan.fee - b.plan.fee)
}

/** One row per model × effort on the active benchmark, priced under the filters. */
export function buildRows(f: Filters, models: readonly Model[]): Row[] {
  const rows: Row[] = []
  for (const model of models) {
    if (!f.models.has(model.id)) continue
    // A model published at a single setting has no effort curve to filter, so it always shows.
    const efforts = (model.efforts.length === 1 ? [...model.efforts] : model.efforts.filter((e) => f.efforts.has(e.effort))).sort(
      (a, b) => EFFORT_ORDER.indexOf(a.effort) - EFFORT_ORDER.indexOf(b.effort),
    )
    for (const e of efforts) {
      const base = {
        key: `${model.id}@${e.effort}`,
        modelId: model.id,
        model,
        effort: e.effort,
        score: e.score,
        apiCost: e.apiCost,
        outputTokens: e.outputTokens,
        harness: e.harness,
        ranBy: e.source,
      }
      if (f.mode === "api") {
        rows.push({ ...base, cost: e.apiCost, source: "api", plan: null, offer: null })
        continue
      }
      const best = quotesFor(model, e.apiCost, f).find((q) => !q.excludedBy)
      if (best) {
        rows.push({ ...base, cost: best.cost, source: best.cost === 0 ? "free" : "subscription", plan: best.plan, offer: best.offer })
      } else {
        // No plan survives the filters: keep the model on the chart at its API price.
        rows.push({ ...base, cost: e.apiCost, source: "api", plan: null, offer: null })
      }
    }
  }
  return rows
}

/** True when a row's price rests on a low-confidence allowance estimate. */
export const isLowConfidence = (r: Row) => r.source === "subscription" && r.offer?.confidence === "low"

/** Upper-left Pareto frontier: points no other point beats on both cost and score. */
export function paretoFrontier(rows: readonly Row[]): Row[] {
  const sorted = [...rows].sort((a, b) => a.cost - b.cost || b.score - a.score)
  const frontier: Row[] = []
  for (const r of sorted) {
    if (!frontier.length || r.score > frontier[frontier.length - 1].score) frontier.push(r)
  }
  return frontier
}
