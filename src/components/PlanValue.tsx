import { useState } from "react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { data, labGroup, type ModelMeta, type Offer, type Plan } from "@/lib/data"
import { cheaper, fee, money } from "@/lib/format"
import { allowanceMultiplier, planExclusion, type Filters } from "@/lib/pricing"
import type { ChartPalette } from "@/lib/theme"

interface ModelValue {
  model: ModelMeta
  offer: Offer
  /** API dollars a full month of the allowance would cost at list price; Infinity when unmetered. */
  usd: number
}

interface PlanValueRow {
  plan: Plan
  excludedBy: string | null
  values: ModelValue[]
  /** Value if the whole allowance goes to the plan's best-value model. Allowances are shared, so values never add up. */
  best: number
}

const modelById = new Map(data.models.map((m) => [m.id, m]))

/**
 * A plan's monthly allowance priced at the model's API rate: fee × (API $/Mtok ÷ plan $/Mtok), which is the
 * tokens it allows in a month times the list price per token, on the same token mix. Codex resets scale it up.
 */
function planValues(plan: Plan, f: Filters): ModelValue[] {
  const multiplier = allowanceMultiplier(plan, f)
  return plan.offers
    // Every model the plan serves, whatever the model filter: a plan's value shouldn't shrink because a model is hidden from the chart.
    .filter((o) => !(f.hideLowConfidence && o.confidence === "low"))
    .flatMap((offer) => {
      const model = modelById.get(offer.modelId)
      if (!model) return []
      if (offer.unmetered) return [{ model, offer, usd: Infinity }]
      if (!model.api) return []
      return [{ model, offer, usd: (plan.fee * model.api.usdPerMtok * multiplier) / offer.usdPerMtok }]
    })
    .sort((a, b) => b.usd - a.usd)
}

type SortKey = "value" | "fee" | "multiple"


export function PlanValue({ filters, palette }: { filters: Filters; palette: ChartPalette }) {
  const [sort, setSort] = useState<SortKey>("value")
  const rows: PlanValueRow[] = data.plans
    // GLM's peak / blended / off-peak readings are one plan; show the active one.
    .filter((p) => !p.scenario || p.scenario === filters.glmScenario)
    .map((plan) => {
      const values = planValues(plan, filters)
      return { plan, excludedBy: planExclusion(plan, filters), values, best: values[0]?.usd ?? 0 }
    })
    .filter((r) => r.values.length)
  const order: Record<SortKey, (a: PlanValueRow, b: PlanValueRow) => number> = {
    value: (a, b) => b.best - a.best,
    fee: (a, b) => a.plan.fee - b.plan.fee || b.best - a.best,
    multiple: (a, b) => b.best / b.plan.fee - a.best / a.plan.fee,
  }
  rows.sort((a, b) => Number(!!a.excludedBy) - Number(!!b.excludedBy) || order[sort](a, b))

  // One log scale for the whole page, so bars compare across plans.
  const finite = rows.flatMap((r) => r.values.map((v) => v.usd)).filter(Number.isFinite)
  const lo = Math.log10(Math.min(...finite, ...rows.map((r) => r.plan.fee))) - 0.2
  const hi = Math.log10(Math.max(...finite))
  const width = (usd: number) => (Number.isFinite(usd) ? Math.max(2, ((Math.log10(usd) - lo) / (hi - lo)) * 100) : 100)

  return (
    <div className="space-y-4">
      <ToggleGroup type="single" variant="outline" size="sm" value={sort} onValueChange={(v) => v && setSort(v as SortKey)} aria-label="Sort plans">
        <ToggleGroupItem value="value" className="h-7 px-2.5 text-[12px]">
          Most API value
        </ToggleGroupItem>
        <ToggleGroupItem value="multiple" className="h-7 px-2.5 text-[12px]">
          Value per $ of fee
        </ToggleGroupItem>
        <ToggleGroupItem value="fee" className="h-7 px-2.5 text-[12px]">
          Monthly fee
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map((row) => {
          const { plan, excludedBy, values, best: top } = row
          return (
          <div key={plan.id} data-out={!!excludedBy} className="space-y-3 rounded-xl border bg-card/50 p-4 data-[out=true]:opacity-50" title={excludedBy ?? undefined}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div>
                <div className="text-[14px] font-medium">
                  {plan.name} <span className="font-normal text-muted-foreground tabular-nums">{fee(plan.fee)}/mo</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {plan.kind === "tool" ? "Third-party tool" : plan.provider}
                  {excludedBy ? ` · outside your filters: ${excludedBy.toLowerCase()}` : null}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[15px] font-semibold tabular-nums">{Number.isFinite(top) ? `≈ ${money(top)}` : "Unmetered"}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {Number.isFinite(top)
                    ? `a month, all on ${values[0].model.short} · ${cheaper(top, plan.fee) ?? "≤ 1×"} the fee`
                    : "no token limit measured"}
                </div>
              </div>
            </div>
            <ul className="space-y-1.5">
              {values.map(({ model, offer, usd }) => (
                <li key={model.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[12.5px]">
                  <span className="truncate" title={offer.source}>
                    {offer.confidence === "low" ? <span className="text-muted-foreground">≈ </span> : null}
                    {model.short}
                  </span>
                  <span className="h-2.5 rounded-r-full bg-muted">
                    <span className="block h-full rounded-r-full" style={{ width: `${width(usd)}%`, background: palette[labGroup(model)] }} />
                  </span>
                  <span className="w-20 text-right tabular-nums">{Number.isFinite(usd) ? money(usd) : "Unmetered"}</span>
                </li>
              ))}
            </ul>
          </div>
          )
        })}
      </div>
    </div>
  )
}
