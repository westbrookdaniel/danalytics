import { Badge } from "@/components/ui/badge"
import { EFFORT_ORDER, labGroup, type Model } from "@/lib/data"
import { cheaper, currencySymbol, EFFORT_LABEL, fee, money, pct, toCurrency } from "@/lib/format"
import { quotesFor, type Filters } from "@/lib/pricing"
import type { ChartPalette } from "@/lib/theme"

interface Props {
  model: Model
  filters: Filters
  palette: ChartPalette
}

/** Every plan that serves one model at its best effort, as a log-scaled bar list against API price. */
export function PlanBreakdown({ model, filters, palette }: Props) {
  const best = [...model.efforts]
    .sort((a, b) => EFFORT_ORDER.indexOf(a.effort) - EFFORT_ORDER.indexOf(b.effort))
    .reduce((a, b) => (b.score > a.score ? b : a))
  const quotes = quotesFor(model, best.apiCost, filters)
  const color = palette[labGroup(model)]

  const priced = [best.apiCost, ...quotes.map((q) => q.cost)].filter((v) => v > 0)
  const lo = Math.log10(Math.min(...priced)) - 0.3
  const hi = Math.log10(Math.max(...priced))
  const width = (v: number) => (v <= 0 ? 2 : Math.max(2, ((Math.log10(v) - lo) / (hi - lo)) * 100))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[14px] font-medium">
            <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
            {model.name}
          </div>
          <div className="text-xs text-muted-foreground">
            Best at {EFFORT_LABEL[best.effort] ?? best.effort} effort · {pct(best.score)} · {model.harness}
          </div>
        </div>
        {model.api ? (
          <Badge variant="secondary" title={model.api.note}>
            API basis
            <span className="font-semibold text-foreground tabular-nums">
              {currencySymbol()}
              {toCurrency(model.api.usdPerMtok).toFixed(3)}/Mtok
            </span>
            <span className="text-muted-foreground/80">{model.api.basis}</span>
          </Badge>
        ) : null}
      </div>

      {quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No subscription in the Real API Pricing dataset serves this model with a measurable allowance, so it is priced at API rates only.
        </p>
      ) : null}

      <ul className="space-y-1.5">
        {quotes.map((q) => {
          const saving = cheaper(best.apiCost, q.cost)
          return (
            <li key={q.plan.id} data-out={!!q.excludedBy} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-[12.5px] data-[out=true]:opacity-45">
              <span className="truncate" title={q.excludedBy ?? q.offer.source}>
                {q.plan.name} <span className="text-muted-foreground tabular-nums">{fee(q.plan.fee)}</span>
              </span>
              <span className="h-2.5 rounded-r-full bg-muted">
                <span className="block h-full rounded-r-full" style={{ width: `${width(q.cost)}%`, background: color }} />
              </span>
              <span className="w-28 text-right tabular-nums">
                {money(q.cost)} {saving ? <span className="text-muted-foreground">· {saving}</span> : null}
              </span>
            </li>
          )
        })}
        <li className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-[12.5px]">
          <span className="truncate font-medium">API list price</span>
          <span className="h-2.5 rounded-r-full bg-muted">
            <span className="block h-full rounded-r-full bg-foreground/35" style={{ width: `${width(best.apiCost)}%` }} />
          </span>
          <span className="w-28 text-right tabular-nums">{money(best.apiCost)}</span>
        </li>
      </ul>
      {quotes.some((q) => q.offer.confidence === "low") ? (
        <p className="text-xs text-muted-foreground">Some allowances are low-confidence (a single report or a cross-plan assumption).</p>
      ) : null}
    </div>
  )
}
