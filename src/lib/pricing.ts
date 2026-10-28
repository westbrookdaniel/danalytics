import { bracketOf, data, EFFORT_ORDER, type BracketId, type GlmScenario, type Model, type Offer, type Plan, type PlanKind } from "@/lib/data"

export interface Filters {
  mode: "subscription" | "api"
  maxFee: number
  brackets: ReadonlySet<BracketId>
  kinds: ReadonlySet<PlanKind>
  disabledPlans: ReadonlySet<string>
  includeLegacy: boolean
  hideLowConfidence: boolean
  glmScenario: GlmScenario
  /** Share of the monthly allowance actually used, 0–1. Half the usage doubles the real price. */
  utilization: number
  /** Show models with no eligible plan at their API price instead of dropping them. */
  apiFallback: boolean
  bestEffortOnly: boolean
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
  passRate: number | null
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
  if (plan.legacy && !f.includeLegacy) return "Legacy pricing"
  if (plan.scenario && plan.scenario !== f.glmScenario) return "Other time-of-day scenario"
  if (f.disabledPlans.has(plan.id)) return "Turned off"
  return null
}

/** Subscription cost of one task: API $/task scaled by the plan's share of list price. */
export function taskCost(model: Model, apiCost: number, offer: Offer, utilization: number): number {
  if (offer.unmetered) return 0
  if (!model.api) return NaN
  return (apiCost * offer.usdPerMtok) / model.api.usdPerMtok / utilization
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
    quotes.push({ plan, offer, cost: taskCost(model, apiCost, offer, f.utilization), excludedBy })
  }
  return quotes.sort((a, b) => a.cost - b.cost || a.plan.fee - b.plan.fee)
}

export function buildRows(f: Filters): Row[] {
  const rows: Row[] = []
  for (const model of data.models) {
    if (!f.models.has(model.id)) continue
    const efforts = [...model.efforts].sort((a, b) => EFFORT_ORDER.indexOf(a.effort) - EFFORT_ORDER.indexOf(b.effort))
    const picked = f.bestEffortOnly ? [efforts.reduce((best, e) => (e.score > best.score ? e : best))] : efforts
    for (const e of picked) {
      const base = {
        key: `${model.id}@${e.effort}`,
        modelId: model.id,
        model,
        effort: e.effort,
        score: e.score,
        apiCost: e.apiCost,
        outputTokens: e.outputTokens,
        passRate: e.passRate,
      }
      if (f.mode === "api") {
        rows.push({ ...base, cost: e.apiCost, source: "api", plan: null, offer: null })
        continue
      }
      const best = quotesFor(model, e.apiCost, f).find((q) => !q.excludedBy)
      if (best) {
        rows.push({ ...base, cost: best.cost, source: best.cost === 0 ? "free" : "subscription", plan: best.plan, offer: best.offer })
      } else if (f.apiFallback) {
        rows.push({ ...base, cost: e.apiCost, source: "api", plan: null, offer: null })
      }
    }
  }
  return rows
}

/** Upper-left Pareto frontier: points no other point beats on both cost and score. */
export function paretoFrontier(rows: readonly Row[]): Row[] {
  const sorted = [...rows].sort((a, b) => a.cost - b.cost || b.score - a.score)
  const frontier: Row[] = []
  for (const r of sorted) {
    if (!frontier.length || r.score > frontier[frontier.length - 1].score) frontier.push(r)
  }
  return frontier
}
