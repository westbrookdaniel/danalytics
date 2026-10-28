import { useEffect, useMemo, useState } from "react"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Controls, type ViewOptions } from "@/components/Controls"
import { CostScoreChart } from "@/components/CostScoreChart"
import { ModelPicker } from "@/components/ModelPicker"
import { PlanBreakdown } from "@/components/PlanBreakdown"
import { PlanList } from "@/components/PlanList"
import { ResultsTable } from "@/components/ResultsTable"
import { BRACKETS, data, MAX_FEE, type BracketId } from "@/lib/data"
import { cheaper, EFFORT_LABEL, fee, pct, usd } from "@/lib/format"
import { buildRows, paretoFrontier, planExclusion, type Filters, type Row } from "@/lib/pricing"
import { CHART_COLORS, useTheme, type ThemePref } from "@/lib/theme"

const INITIAL_FILTERS: Filters = {
  mode: "subscription",
  maxFee: MAX_FEE,
  brackets: new Set<BracketId>(BRACKETS.map((b) => b.id)),
  kinds: new Set(["lab", "tool"]),
  disabledPlans: new Set(),
  includeLegacy: false,
  hideLowConfidence: false,
  glmScenario: "mid",
  utilization: 1,
  apiFallback: true,
  bestEffortOnly: false,
  models: new Set(data.models.filter((m) => !m.superseded).map((m) => m.id)),
}

function useChartHeight() {
  const query = "(min-width: 1024px)"
  const [wide, setWide] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const onChange = () => setWide(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return wide ? 660 : 440
}

export default function App() {
  const { pref, setPref, isDark } = useTheme()
  const palette = isDark ? CHART_COLORS.dark : CHART_COLORS.light
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const [view, setView] = useState<ViewOptions>({ showApiGhost: false, showFrontier: true })
  const [highlight, setHighlight] = useState<string | null>(null)
  const chartHeight = useChartHeight()

  const rows = useMemo(() => buildRows(filters), [filters])
  const focusModel = data.models.find((m) => m.id === highlight) ?? topRow(rows)?.model ?? null

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              FrontierCode 2.0 · main subset · 132 tasks
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">What a mergeable PR really costs on a subscription</h1>
            <p className="text-pretty text-muted-foreground">
              Cognition's FrontierCode 2.0 grades coding agents on changes maintainers would actually merge. Each task's API cost is re-priced at what a
              full-allowance subscriber pays per token, using Real API Pricing's measured plan quotas. Cap the monthly fee, switch price brackets on and
              off, and watch the frontier move.
            </p>
          </div>
          <ThemeSwitch pref={pref} onChange={setPref} />
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:px-8">
        <aside className="order-2 space-y-6 lg:order-1 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <Card>
            <CardContent>
              <Controls filters={filters} setFilters={setFilters} view={view} setView={setView} />
            </CardContent>
          </Card>
          {filters.mode === "subscription" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Plans</CardTitle>
                <CardDescription>{plansInPlay(filters)} in play. Untick any plan to drop it.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80 pr-3">
                  <PlanList filters={filters} setFilters={setFilters} />
                </ScrollArea>
              </CardContent>
            </Card>
          ) : null}
        </aside>

        <div className="order-1 min-w-0 space-y-6 lg:order-2">
          <Headline rows={rows} filters={filters} />

          <Card className="gap-4">
            <CardContent className="space-y-5">
              <ModelPicker
                selected={filters.models}
                onChange={(models) => setFilters((f) => ({ ...f, models }))}
                highlight={highlight}
                onHighlight={setHighlight}
                palette={palette}
              />
              <div className="-mx-2">
                {rows.length ? (
                  <CostScoreChart
                    rows={rows}
                    palette={palette}
                    mode={filters.mode}
                    showApiGhost={view.showApiGhost}
                    showFrontier={view.showFrontier}
                    highlight={highlight}
                    onHighlight={setHighlight}
                    height={chartHeight}
                    compact={chartHeight < 600}
                  />
                ) : (
                  <div className="grid place-items-center text-sm text-muted-foreground" style={{ height: chartHeight }}>
                    Nothing to plot. Pick some models or loosen the plan filters.
                  </div>
                )}
              </div>
              <Legend mode={filters.mode} view={view} palette={palette} />
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Every plan for one model</CardTitle>
                <CardDescription>Click a line, chip or table row to pick a model. Greyed plans are outside your filters.</CardDescription>
              </CardHeader>
              <CardContent>{focusModel ? <PlanBreakdown model={focusModel} filters={filters} palette={palette} /> : null}</CardContent>
            </Card>
            <Method />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">All results in view</CardTitle>
              <CardDescription>
                {rows.length} model × effort points. Pts per $ is FrontierCode points per dollar of one task.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResultsTable rows={rows} mode={filters.mode} palette={palette} highlight={highlight} onHighlight={setHighlight} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

const topRow = (rows: readonly Row[]) => rows.reduce<Row | null>((best, r) => (!best || r.score > best.score ? r : best), null)

function plansInPlay(f: Filters) {
  const active = data.plans.filter((p) => !p.scenario || p.scenario === f.glmScenario)
  const on = active.filter((p) => !planExclusion(p, f)).length
  return `${on} of ${active.length} plans`
}

function Headline({ rows, filters }: { rows: readonly Row[]; filters: Filters }) {
  const top = topRow(rows)
  const frontier = paretoFrontier(rows)
  // The cheapest frontier point within 5 points of the leader: "nearly as good, for much less".
  const value = top ? frontier.find((r) => r.score >= top.score - 5) : null
  const sub = filters.mode === "subscription"
  const cap = filters.maxFee >= MAX_FEE ? "any budget" : `${fee(filters.maxFee)}/mo`

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat
        label={sub ? `Top score, ${cap}` : "Top score"}
        value={top ? pct(top.score) : "—"}
        detail={top ? `${top.model.short} ${EFFORT_LABEL[top.effort] ?? top.effort}${top.plan ? ` · ${top.plan.name}` : ""}` : "No models in view"}
      />
      <Stat
        label="Its cost per task"
        value={top ? usd(top.cost) : "—"}
        detail={
          top
            ? sub && top.source !== "api"
              ? `vs ${usd(top.apiCost)} at API prices${cheaper(top.apiCost, top.cost) ? ` · ${cheaper(top.apiCost, top.cost)} cheaper` : ""}`
              : "API list price"
            : ""
        }
      />
      <Stat
        label="Within 5 pts, cheapest"
        value={value ? usd(value.cost) : "—"}
        detail={value ? `${value.model.short} ${EFFORT_LABEL[value.effort] ?? value.effort} · ${pct(value.score)}${value.plan ? ` · ${value.plan.name}` : ""}` : ""}
      />
    </div>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        <div className="truncate text-sm text-muted-foreground" title={detail}>
          {detail}
        </div>
      </CardContent>
    </Card>
  )
}

function Legend({ mode, view, palette }: { mode: Filters["mode"]; view: ViewOptions; palette: (typeof CHART_COLORS)["light"] | (typeof CHART_COLORS)["dark"] }) {
  const swatch = (group: "OpenAI" | "Anthropic" | "Other labs") => (
    <span className="inline-flex items-center gap-2">
      <span className="h-0.5 w-5 rounded-full" style={{ background: palette[group] }} />
      {group}
    </span>
  )
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-muted-foreground">
      {swatch("OpenAI")}
      {swatch("Anthropic")}
      {swatch("Other labs")}
      <span className="hidden h-3 w-px bg-border sm:block" />
      <span>Points run low → max reasoning effort</span>
      {mode === "subscription" ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-muted-foreground" /> hollow = no plan in range, API price
        </span>
      ) : null}
      {view.showFrontier ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 border-t border-dashed border-foreground/60" /> Pareto frontier
        </span>
      ) : null}
    </div>
  )
}

function ThemeSwitch({ pref, onChange }: { pref: ThemePref; onChange: (p: ThemePref) => void }) {
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={pref} onValueChange={(v) => v && onChange(v as ThemePref)} aria-label="Theme">
      <ToggleGroupItem value="light" aria-label="Light">
        <SunIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="system" aria-label="System">
        <MonitorIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark">
        <MoonIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

function Method() {
  const { benchmark, pricing, reference } = data.sources
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">How the numbers are made</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Subscription $ / task</span> = Cognition's API $ / task × (plan's real $ per million tokens ÷ the
          model's API $ per million tokens). Both per-token prices use Real API Pricing's standard workload (97% cache reads, 2.5% fresh input, 0.5% output),
          so the ratio is the share of list price a full-allowance subscriber pays.
        </p>
        <p>
          Allowances are measured from dashboards, local logs and saturation runs where possible, and assume the quota is used up. The cheapest eligible plan is
          picked per model. GPT-6 Astra, Sol and 6.1 Sol have no published API price in the dataset, so their per-token basis is implied from mypriors'
          ChatGPT Plus figures; GPT-6 Luna is estimated from Factory Droid multipliers.
        </p>
        <ul className="space-y-1">
          <li>
            Scores and API costs:{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href={benchmark.url} target="_blank" rel="noreferrer">
              {benchmark.name}
            </a>
          </li>
          <li>
            Plan allowances:{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href={pricing.url} target="_blank" rel="noreferrer">
              {pricing.name}
            </a>{" "}
            (snapshot {pricing.snapshot})
          </li>
          <li>
            Inspired by{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href={reference.url} target="_blank" rel="noreferrer">
              {reference.name}
            </a>
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}
