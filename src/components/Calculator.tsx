import { useState, type ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { data, type Plan } from "@/lib/data"
import { currencySymbol, fee, money, toCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Real API Pricing measures weekly limits and records them as monthly allowances at 4 weeks a month, so a weekly
 * allowance is the monthly one over 4.
 */
const WEEKS_PER_MONTH = 4

const modelById = new Map(data.models.map((m) => [m.id, m]))

// GLM's peak / mid / off-peak readings are one plan; the calculator uses the blended (mid) reading.
const PLANS = data.plans.filter((p) => !p.scenario || p.scenario === "mid")
const PROVIDER_ORDER = [...new Set(["Anthropic", "OpenAI", ...PLANS.map((p) => p.provider)])]

/** Models a plan serves that the calculator can price: an API list price, or no limit at all. */
function modelsOn(plan: Plan) {
  return plan.offers
    .flatMap((offer) => {
      const model = modelById.get(offer.modelId)
      return model && (model.api || offer.unmetered) ? [{ model, offer }] : []
    })
    .sort((a, b) => Number(a.model.superseded) - Number(b.model.superseded) || a.model.name.localeCompare(b.model.name))
}

/** Plan's weekly allowance in API dollars at the model's list price, on the shared token mix. Infinity when unmetered. */
function weeklyAllowanceUsd(plan: Plan, modelId: string): number {
  const offer = plan.offers.find((o) => o.modelId === modelId)
  const model = modelById.get(modelId)
  if (!offer || !model) return NaN
  if (offer.unmetered) return Infinity
  if (!model.api) return NaN
  return (plan.fee * model.api.usdPerMtok) / offer.usdPerMtok / WEEKS_PER_MONTH
}

const DEFAULT_PLAN = "claude_max_5x"
const DEFAULT_MODEL = "claude-opus-5.5"

export function Calculator() {
  const [planId, setPlanId] = useState(DEFAULT_PLAN)
  const plan = PLANS.find((p) => p.id === planId) ?? PLANS[0]
  const options = modelsOn(plan)
  const [modelPick, setModelPick] = useState(DEFAULT_MODEL)
  // Keep the pick when the new plan serves it, otherwise fall back to the plan's first model.
  const modelId = options.some((o) => o.model.id === modelPick) ? modelPick : options[0]?.model.id
  const offer = options.find((o) => o.model.id === modelId)?.offer

  // The amount is typed in the display currency and converted back to USD for the maths.
  const [amount, setAmount] = useState("50")

  const spendUsd = Math.max(0, Number(amount) || 0) / toCurrency(1)
  const weekly = modelId ? weeklyAllowanceUsd(plan, modelId) : NaN

  return (
    <div className="mx-auto max-w-xl py-4 sm:py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl tracking-tight">Usage calculator</CardTitle>
          <CardDescription className="text-[13px]">
            Pick a plan and model, enter an amount of usage at API prices, and see what share of the plan's weekly limit it takes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan" htmlFor="calc-plan">
              <Select value={plan.id} onValueChange={setPlanId}>
                <SelectTrigger id="calc-plan" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-80">
                  {PROVIDER_ORDER.map((provider) => (
                    <SelectGroup key={provider}>
                      <SelectLabel>{provider}</SelectLabel>
                      {PLANS.filter((p) => p.provider === provider).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} <span className="text-muted-foreground tabular-nums">{fee(p.fee)}/mo</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Model" htmlFor="calc-model">
              <Select value={modelId} onValueChange={setModelPick} disabled={!options.length}>
                <SelectTrigger id="calc-model" className="w-full">
                  <SelectValue placeholder="No priced models" />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-80">
                  {options.map(({ model, offer: o }) => (
                    <SelectItem key={model.id} value={model.id}>
                      {o.confidence === "low" ? <span className="text-muted-foreground">≈ </span> : null}
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="API spend" htmlFor="calc-amount">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted-foreground">{currencySymbol()}</span>
              <Input
                id="calc-amount"
                type="number"
                inputMode="decimal"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tabular-nums"
                style={{ paddingLeft: `${currencySymbol().length * 0.6 + 1.25}rem` }}
              />
            </div>
          </Field>

          <div className="grid gap-3 border-t pt-5">
            <Meter
              label="Weekly limit"
              percent={spendUsd / weekly}
              detail={
                Number.isFinite(weekly)
                  ? `${money(spendUsd)} of about ${money(weekly)} a week`
                  : Number.isNaN(weekly)
                    ? "No allowance measured for this model"
                    : "No token limit measured on this plan"
              }
            />
          </div>

          <p className="text-[12px] leading-relaxed text-muted-foreground">
            The weekly allowance is Real API Pricing's measured monthly allowance ÷ {WEEKS_PER_MONTH}, priced at the model's API list rate on a cache-heavy
            agent token mix.{offer?.confidence === "low" ? " This plan × model pair is a low-confidence estimate." : null} 5-hour windows aren't covered:
            no source measures them.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-[12px] font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function Meter({
  label,
  percent,
  detail,
}: {
  label: string
  /** Share of the limit used, 1 = 100%. NaN when the plan has no limit for this model. */
  percent: number
  detail: string
}) {
  const valid = Number.isFinite(percent)
  const over = valid && percent > 1
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13px] font-medium">{label}</span>
        <span className={cn("text-3xl font-semibold tracking-tight tabular-nums", over && "text-destructive")}>{valid ? formatPercent(percent) : "—"}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width]", over ? "bg-destructive" : percent > 0.8 ? "bg-amber-500" : "bg-primary")}
          style={{ width: valid ? `${Math.min(100, percent * 100)}%` : 0 }}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 text-[12px] text-muted-foreground tabular-nums">
        <span>{detail}</span>
      </div>
    </div>
  )
}

function formatPercent(share: number): string {
  const p = share * 100
  if (p === 0) return "0%"
  if (p < 1) return "<1%"
  if (p >= 1000) return `${Math.round(p).toLocaleString()}%`
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`
}
