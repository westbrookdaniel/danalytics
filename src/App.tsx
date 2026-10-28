import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { MoonIcon, SunIcon, MonitorIcon } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { CostScoreChart, type XScale } from "@/components/CostScoreChart"
import { PlanBreakdown } from "@/components/PlanBreakdown"
import { ResultsTable } from "@/components/ResultsTable"
import { Sidebar, TextToggle } from "@/components/Sidebar"
import { BRACKETS, data, EFFORT_ORDER, MAX_FEE, type BracketId } from "@/lib/data"
import { cheaper, EFFORT_LABEL, fee, pct, usd } from "@/lib/format"
import { buildRows, type Filters, type Row } from "@/lib/pricing"
import { flip } from "@/lib/sets"
import { CHART_COLORS, useTheme, type ThemePref } from "@/lib/theme"
import { cn } from "@/lib/utils"

type View = "subscription" | "api" | "plans" | "results" | "method"

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
  efforts: new Set(EFFORT_ORDER),
  models: new Set(data.models.filter((m) => !m.superseded).map((m) => m.id)),
}

const VIEWS: { id: View; label: string }[] = [
  { id: "subscription", label: "Subscription cost vs score" },
  { id: "api", label: "API cost vs score" },
]
const DETAIL_VIEWS: { id: View; label: string }[] = [
  { id: "plans", label: "Plans by model" },
  { id: "results", label: "All results" },
  { id: "method", label: "Method" },
]

function viewFromHash(): View {
  const id = location.hash.slice(1)
  return [...VIEWS, ...DETAIL_VIEWS].some((v) => v.id === id) ? (id as View) : "subscription"
}

/** Tracks an element's height so the chart can fill whatever space the layout leaves it. */
function useHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [height, setHeight] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([entry]) => setHeight(Math.round(entry.contentRect.height)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, height] as const
}

function useWide() {
  const [wide, setWide] = useState(() => matchMedia("(min-width: 1024px)").matches)
  useEffect(() => {
    const mq = matchMedia("(min-width: 1024px)")
    const onChange = () => setWide(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return wide
}

export default function App() {
  const { pref, setPref, isDark } = useTheme()
  const palette = isDark ? CHART_COLORS.dark : CHART_COLORS.light
  const [view, setViewState] = useState<View>(viewFromHash)
  // The chart views own the pricing mode; detail views keep whichever was last charted.
  const [mode, setMode] = useState<Filters["mode"]>(() => (view === "api" ? "api" : "subscription"))
  // Mirror the active tab in the URL hash so each view can be linked to directly.
  const setView = (v: View) => {
    setViewState(v)
    if (v === "subscription" || v === "api") setMode(v)
    history.replaceState(null, "", v === "subscription" ? location.pathname : `#${v}`)
  }
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const [scale, setScale] = useState<XScale>("log")
  const [showFrontier, setShowFrontier] = useState(true)
  const [showApiGhost, setShowApiGhost] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const wide = useWide()
  const [chartBox, boxHeight] = useHeight<HTMLDivElement>()

  const effective = useMemo(() => ({ ...filters, mode }), [filters, mode])
  const rows = useMemo(() => buildRows(effective), [effective])
  const highlight = hovered ?? selected
  const charting = view === "subscription" || view === "api"
  const sub = mode === "subscription"
  const chartHeight = wide ? Math.max(420, boxHeight) : 460

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh">
      <header className="flex h-14 shrink-0 items-stretch gap-6 border-b px-4 sm:px-6">
        <div className="flex items-center gap-5">
          <span className="text-[19px] font-semibold tracking-tight">
            frontier<span className="text-muted-foreground">costs</span>
          </span>
          <span className="hidden items-center gap-3 border-r pr-5 text-[12px] sm:flex">
            <span className="font-medium">FrontierCode 2.0</span>
            <span className="text-muted-foreground">main · 132 tasks</span>
          </span>
        </div>
        <nav className="flex min-w-0 flex-1 items-stretch gap-5 overflow-x-auto [scrollbar-width:none]">
          {VIEWS.map((v) => (
            <Tab key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
            </Tab>
          ))}
          <span className="h-3.5 w-px shrink-0 self-center bg-border" />
          {DETAIL_VIEWS.map((v) => (
            <Tab key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
            </Tab>
          ))}
        </nav>
        <ThemeButton pref={pref} onChange={setPref} />
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_264px]">
        <main className="flex min-h-0 min-w-0 flex-col px-4 pt-5 pb-3 sm:px-6">
          {charting ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <h1 className="text-base font-medium">
                  {sub ? "Subscription cost vs score" : "API cost vs score"}
                  <span className="ml-3 text-[12px] font-normal text-muted-foreground">
                    {sub ? "Cheapest eligible plan per model, full allowance used" : "Cognition's measured list-price cost per task"}
                  </span>
                </h1>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                  <CheckToggle on={showFrontier} onClick={() => setShowFrontier(!showFrontier)}>
                    Pareto line
                  </CheckToggle>
                  {sub ? (
                    <>
                      <CheckToggle on={showApiGhost} onClick={() => setShowApiGhost(!showApiGhost)}>
                        API ghosts
                      </CheckToggle>
                      <CheckToggle on={filters.apiFallback} onClick={() => setFilters((f) => ({ ...f, apiFallback: !f.apiFallback }))}>
                        API fallback
                      </CheckToggle>
                    </>
                  ) : null}
                  <div className="flex gap-3">
                    {(["linear", "log"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={scale === s}
                        onClick={() => setScale(s)}
                        className="border-b border-transparent py-1 text-[12px] text-muted-foreground capitalize hover:text-foreground aria-pressed:border-foreground aria-pressed:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {sub ? <BudgetBar filters={filters} setFilters={setFilters} /> : null}
              <Summary rows={rows} sub={sub} />

              <div ref={chartBox} className="relative mt-2 min-h-[420px] flex-1">
                <span className="pointer-events-none absolute top-0 left-1 z-10 text-[12px] text-muted-foreground">FrontierCode 2.0 score (%)</span>
                <div className="absolute inset-0 max-lg:relative">
                  {rows.length ? (
                    <CostScoreChart
                      rows={rows}
                      palette={palette}
                      mode={mode}
                      scale={scale}
                      showApiGhost={showApiGhost}
                      showFrontier={showFrontier}
                      highlight={highlight}
                      onSelectModel={(id) => setSelected(id && id !== selected ? id : null)}
                      height={chartHeight}
                      compact={!wide}
                    />
                  ) : (
                    <div className="grid h-full min-h-[420px] place-items-center text-sm text-muted-foreground">
                      Nothing to plot. Pick some models or loosen the plan filters.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto pb-6">
              {view === "plans" ? <PlansView filters={effective} palette={palette} /> : null}
              {view === "results" ? (
                <>
                  <h1 className="mb-4 text-base font-medium">
                    All results
                    <span className="ml-3 text-[12px] font-normal text-muted-foreground">
                      {rows.length} model × effort points · {sub ? "subscription" : "API"} pricing · click a row to highlight it on the chart
                    </span>
                  </h1>
                  <ResultsTable rows={rows} mode={mode} palette={palette} highlight={selected} onHighlight={setSelected} />
                </>
              ) : null}
              {view === "method" ? <Method /> : null}
            </div>
          )}

          <footer className="mt-3 flex shrink-0 flex-wrap justify-between gap-2 border-t pt-3 text-[11px] text-muted-foreground">
            <span>
              Data from{" "}
              <a className="text-foreground hover:underline" href={data.sources.benchmark.url} target="_blank" rel="noreferrer">
                Cognition FrontierCode 2.0
              </a>{" "}
              and{" "}
              <a className="text-foreground hover:underline" href={data.sources.pricing.url} target="_blank" rel="noreferrer">
                Real API Pricing
              </a>{" "}
              ({data.sources.pricing.snapshot})
            </span>
            <button type="button" onClick={() => setView("method")} className="hover:text-foreground">
              How subscription costs are computed
            </button>
          </footer>
        </main>

        <aside className="min-h-0 border-t lg:overflow-y-auto lg:border-t-0 lg:border-l lg:[scrollbar-width:thin]">
          <Sidebar
            filters={filters}
            setFilters={setFilters}
            palette={palette}
            highlight={highlight}
            onHover={setHovered}
            onReset={() => {
              setFilters(INITIAL_FILTERS)
              setSelected(null)
            }}
            showPlans={sub}
          />
        </aside>
      </div>
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex shrink-0 items-center text-[12.5px] whitespace-nowrap transition-colors",
        active ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function CheckToggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="inline-flex items-center gap-2 py-1 text-[12px] hover:text-foreground">
      <span className={cn("grid size-3 place-items-center rounded-[3px] border border-foreground/40 text-[9px] leading-none", on && "border-foreground bg-foreground text-background")}>
        {on ? "✓" : ""}
      </span>
      {children}
    </button>
  )
}

function BudgetBar({ filters, setFilters }: { filters: Filters; setFilters: (u: (f: Filters) => Filters) => void }) {
  const patch = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }))
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-3 border-y py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-muted-foreground">Max subscription</span>
        <Slider
          className="w-44"
          min={0}
          max={MAX_FEE}
          step={5}
          value={[filters.maxFee]}
          onValueChange={([v]) => patch({ maxFee: v })}
          aria-label="Maximum monthly subscription cost"
        />
        <span className="w-16 text-[12px] font-medium tabular-nums">{filters.maxFee >= MAX_FEE ? "Any" : `$${filters.maxFee}/mo`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[12px] text-muted-foreground">Brackets</span>
        {BRACKETS.map((b) => (
          <TextToggle
            key={b.id}
            on={filters.brackets.has(b.id)}
            onClick={() => patch({ brackets: flip(filters.brackets, b.id) })}
            onDoubleClick={() => patch({ brackets: new Set([b.id]) })}
            title={`${b.hint}. Double-click to show only this bracket.`}
            className="tabular-nums"
          >
            {b.label}
          </TextToggle>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-muted-foreground" title="Subscriptions assume the whole quota is used. Use half and each task costs double.">
          Allowance used
        </span>
        <Slider
          className="w-28"
          min={10}
          max={100}
          step={5}
          value={[Math.round(filters.utilization * 100)]}
          onValueChange={([v]) => patch({ utilization: v / 100 })}
          aria-label="Share of monthly allowance used"
        />
        <span className="w-9 text-[12px] font-medium tabular-nums">{Math.round(filters.utilization * 100)}%</span>
      </div>
    </div>
  )
}

/** One-line readout of the leader under the current filters. */
function Summary({ rows, sub }: { rows: readonly Row[]; sub: boolean }) {
  const top = rows.reduce<Row | null>((best, r) => (!best || r.score > best.score ? r : best), null)
  if (!top) return null
  const saving = sub && top.source !== "api" ? cheaper(top.apiCost, top.cost) : null
  return (
    <p className="mt-2.5 text-[12px] text-muted-foreground">
      Leader: <span className="font-medium text-foreground">{top.model.short}</span> {EFFORT_LABEL[top.effort] ?? top.effort} at{" "}
      <span className="font-medium text-foreground tabular-nums">{pct(top.score)}</span> for{" "}
      <span className="font-medium text-foreground tabular-nums">{usd(top.cost)}</span> a task
      {top.plan ? (
        <>
          {" "}
          on {top.plan.name} ({fee(top.plan.fee)}/mo)
        </>
      ) : null}
      {saving ? <>, {saving} cheaper than the {usd(top.apiCost)} API price</> : null}
    </p>
  )
}

function PlansView({ filters, palette }: { filters: Filters; palette: (typeof CHART_COLORS)["light" | "dark"] }) {
  const models = data.models
    .filter((m) => filters.models.has(m.id))
    .sort((a, b) => Math.max(...b.efforts.map((e) => e.score)) - Math.max(...a.efforts.map((e) => e.score)))
  return (
    <>
      <h1 className="mb-1 text-base font-medium">
        Plans by model
        <span className="ml-3 text-[12px] font-normal text-muted-foreground">Every plan that serves each model, priced at its best effort level</span>
      </h1>
      <p className="mb-5 text-[12px] text-muted-foreground">Faded plans are outside the current filters. Bars are log-scaled against the API price.</p>
      <div className="grid gap-x-10 gap-y-8 xl:grid-cols-2">
        {models.map((m) => (
          <div key={m.id} className="border-t pt-4">
            <PlanBreakdown model={m} filters={filters} palette={palette} />
          </div>
        ))}
      </div>
    </>
  )
}

function ThemeButton({ pref, onChange }: { pref: ThemePref; onChange: (p: ThemePref) => void }) {
  const next: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" }
  const Icon = pref === "light" ? SunIcon : pref === "dark" ? MoonIcon : MonitorIcon
  return (
    <button
      type="button"
      onClick={() => onChange(next[pref])}
      title={`Theme: ${pref}`}
      className="grid size-8 place-items-center self-center rounded text-muted-foreground hover:text-foreground"
    >
      <Icon className="size-4" />
    </button>
  )
}

function Method() {
  const { benchmark, pricing, reference } = data.sources
  return (
    <div className="max-w-2xl space-y-4 text-sm leading-relaxed text-muted-foreground">
      <h1 className="text-base font-medium text-foreground">How subscription costs are computed</h1>
      <p>
        <span className="font-medium text-foreground">Subscription $ / task</span> = Cognition's API $ / task × (plan's real $ per million tokens ÷ the model's
        API $ per million tokens) ÷ allowance used. Both per-token prices use Real API Pricing's standard workload (97% cache reads, 2.5% fresh input, 0.5%
        output; Anthropic bills fresh input as cache writes, Google uses a low-cache mix), so the ratio is the share of list price a full-allowance subscriber
        pays.
      </p>
      <p>
        Allowances are measured from dashboards, local logs and saturation runs where possible. The cheapest plan that passes your filters is picked per model.
        GPT-6 Astra, Sol and 6.1 Sol have no published API price in the dataset, so their per-token basis is implied from mypriors' ChatGPT Plus figures; GPT-6
        Luna is estimated from Factory Droid multipliers. Models with no measurable allowance stay at API price, drawn hollow.
      </p>
      <ul className="space-y-1">
        <li>
          Scores and API costs:{" "}
          <a className="text-foreground underline underline-offset-2" href={benchmark.url} target="_blank" rel="noreferrer">
            {benchmark.name}
          </a>
        </li>
        <li>
          Plan allowances:{" "}
          <a className="text-foreground underline underline-offset-2" href={pricing.url} target="_blank" rel="noreferrer">
            {pricing.name}
          </a>{" "}
          (snapshot {pricing.snapshot})
        </li>
        <li>
          Inspired by{" "}
          <a className="text-foreground underline underline-offset-2" href={reference.url} target="_blank" rel="noreferrer">
            {reference.name}
          </a>
        </li>
      </ul>
    </div>
  )
}

