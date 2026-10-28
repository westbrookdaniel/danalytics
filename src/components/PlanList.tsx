import { Checkbox } from "@/components/ui/checkbox"
import { BRACKETS, bracketOf, data, type Plan } from "@/lib/data"
import { fee } from "@/lib/format"
import { planExclusion, type Filters } from "@/lib/pricing"

interface Props {
  filters: Filters
  setFilters: (update: (f: Filters) => Filters) => void
}

/** Per-plan on/off list, grouped by fee bracket, explaining why a plan is out of play. */
export function PlanList({ filters, setFilters }: Props) {
  // One row per plan group: GLM's peak/mid/off-peak readings collapse to the active scenario.
  const plans = data.plans.filter((p) => !p.scenario || p.scenario === filters.glmScenario)
  const modelNames = new Map(data.models.map((m) => [m.id, m.short]))

  const toggle = (plan: Plan, on: boolean) =>
    setFilters((f) => {
      const next = new Set(f.disabledPlans)
      if (on) next.delete(plan.id)
      else next.add(plan.id)
      return { ...f, disabledPlans: next }
    })

  return (
    <div className="space-y-4">
      {BRACKETS.map((b) => {
        const inBracket = plans.filter((p) => bracketOf(p.fee) === b.id)
        if (!inBracket.length) return null
        return (
          <div key={b.id} className="space-y-1">
            <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {b.label} <span className="font-normal normal-case">· {b.hint}</span>
            </div>
            {inBracket.map((plan) => {
              // The checkbox already shows "turned off"; the caption explains the other filters.
              const reason = planExclusion(plan, { ...filters, disabledPlans: new Set() })
              const on = !filters.disabledPlans.has(plan.id)
              const models = plan.offers.map((o) => modelNames.get(o.modelId)).join(", ")
              return (
                <label
                  key={plan.id}
                  data-out={!!reason || !on}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1 hover:bg-accent/60 data-[out=true]:opacity-50"
                >
                  <Checkbox checked={on} onCheckedChange={(v) => toggle(plan, v === true)} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{plan.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{fee(plan.fee)}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground" title={models}>
                      {reason ?? models}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
