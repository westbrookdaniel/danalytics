import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { ChevronDownIcon, InfoIcon, MonitorIcon, MoonIcon, SlidersHorizontalIcon, SunIcon, TriangleAlertIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TooltipProvider } from "@/components/ui/tooltip"
import { CostScoreChart, type XScale } from "@/components/CostScoreChart"
import { Hint } from "@/components/Hint"
import { Link, NavLink, useLocation, useMatch, useSearchParams } from "react-router"
import { LogoMark } from "@/components/LogoMark"
import { PlanBreakdown } from "@/components/PlanBreakdown"
import { ResultsTable } from "@/components/ResultsTable"
import { Sidebar } from "@/components/Sidebar"
import {
  benchmarkById,
  BRACKETS,
  data,
  DEFAULT_BENCHMARK,
  LAST_UPDATED,
  MAX_FEE,
  modelsFor,
  SOURCE_DATES,
  type BracketId,
  type LabGroup,
  type Model,
} from "@/lib/data"
import { bracketLabel, CURRENCIES, feeShort, setCurrency, setScoreUnit, type CurrencyCode } from "@/lib/format"
import { buildRows, type Filters } from "@/lib/pricing"
import { CHART_COLORS, useTheme, type ChartPalette, type ThemePref } from "@/lib/theme"

/** Effort levels that start hidden: the extremes, which most people don't run day to day. */
const DEFAULT_EFFORTS = ["low", "medium", "high", "xhigh", "na"]

const INITIAL_FILTERS: Filters = {
  mode: "api",
  maxFee: MAX_FEE,
  brackets: new Set<BracketId>(BRACKETS.map((b) => b.id)),
  kinds: new Set(["lab", "tool"]),
  disabledPlans: new Set(),
  hideLowConfidence: false,
  glmScenario: "mid",
  efforts: new Set(DEFAULT_EFFORTS),
  models: new Set(data.models.filter((m) => !m.superseded).map((m) => m.id)),
}


const PAGES = [
  { to: "/", label: "Benchmarks" },
  { to: "/plans", label: "Plans" },
]

/** Active benchmark from `?benchmark=` (default when missing or unknown); non-default picks are kept in the URL. */
function useBenchmarkParam() {
  const [params, setParams] = useSearchParams()
  const requested = params.get("benchmark")
  const id = data.benchmarks.some((b) => b.id === requested) ? requested! : DEFAULT_BENCHMARK
  const setId = (next: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === DEFAULT_BENCHMARK) p.delete("benchmark")
        else p.set("benchmark", next)
        return p
      },
      { replace: true },
    )
  return [id, setId] as const
}

/** Start each page at the top. */
function useScrollTopOnNavigate() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
}

const SIDEBAR_KEY = "danalytics-sidebar-width"
const SIDEBAR_DEFAULT = 300
const clampWidth = (w: number) => Math.min(480, Math.max(240, w))

/** Drag-resizable sidebar width, remembered in localStorage. Dragging left widens it. */
function useSidebarWidth() {
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(SIDEBAR_KEY))
      return saved ? clampWidth(saved) : SIDEBAR_DEFAULT
    } catch {
      return SIDEBAR_DEFAULT
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(width))
    } catch {
      // Storage can be blocked; the width still applies for this visit.
    }
  }, [width])
  const start = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const onMove = (ev: PointerEvent) => setWidth(clampWidth(startW + (startX - ev.clientX)))
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      document.body.style.removeProperty("cursor")
      document.body.style.removeProperty("user-select")
    }
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }
  return [width, start, () => setWidth(SIDEBAR_DEFAULT)] as const
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
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const [view, setView] = useState<ViewOptions>(DEFAULT_VIEW)
  const [hovered, setHovered] = useState<string | null>(null)
  const wide = useWide()
  const [sidebarWidth, startResize, resetWidth] = useSidebarWidth()
  const onPlans = useMatch("/plans") != null
  const { search } = useLocation()
  useScrollTopOnNavigate()
  const [currency, setCurrencyState] = useStoredCurrency()
  // Formatting helpers read the display currency from module state; set it before children render.
  setCurrency(currency)

  const [benchmarkId, setBenchmarkId] = useBenchmarkParam()
  const benchmark = benchmarkById(benchmarkId)
  const models = modelsFor(benchmarkId)
  // Like the currency, the score unit is read by formatting helpers; set it before children render.
  setScoreUnit(benchmark.scoreUnit)

  const sub = filters.mode === "subscription"
  const rows = useMemo(() => buildRows(filters, models), [filters, models])
  const setMode = (mode: Filters["mode"]) => setFilters((f) => ({ ...f, mode }))

  return (
    <TooltipProvider>
      <div className="min-h-dvh bg-background">
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
            <Link to={{ pathname: "/", search }} className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
              <LogoMark className="size-6" />
              danalytics
            </Link>
            <nav className="ml-2 flex items-center gap-1">
              {PAGES.map((p) => (
                // NavLink sets aria-current="page" on the active route; keep ?benchmark= across pages.
                <NavLink
                  key={p.to}
                  to={{ pathname: p.to, search }}
                  end
                  className="rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                >
                  {p.label}
                </NavLink>
              ))}
            </nav>
            <UpdatedBadge />
            <span className="ml-auto" />
            <CurrencySelect value={currency} onChange={setCurrencyState} />
            <ThemeSwitch pref={pref} onChange={setPref} />
          </div>
        </header>

        <div
          className="mx-auto grid max-w-[1600px] gap-8 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_var(--sidebar-w)]"
          style={{ "--sidebar-w": `${sidebarWidth}px` } as CSSProperties}
        >
          <main className="min-w-0 space-y-16">
            {onPlans ? (
              <section>
                <PageHeading
                  title="Plans by model"
                  detail="Every plan that serves each model, priced at its best effort level. Faded plans are outside your filters; bars are log-scaled against the API price."
                />
                <PlansView filters={filters} palette={palette} models={models} />
              </section>
            ) : (
              <>
            <section id="chart">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
                  Score vs
                  <Select value={filters.mode} onValueChange={(v) => setMode(v as Filters["mode"])}>
                    <SelectTrigger className="h-9 gap-2 px-3 text-[15px] font-semibold" aria-label="Pricing">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="subscription">Subscription</SelectItem>
                      <SelectItem value="api">API</SelectItem>
                    </SelectContent>
                  </Select>
                  cost per task on
                  <BenchmarkSelect value={benchmarkId} onChange={setBenchmarkId} />
                </h1>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {sub ? <BudgetControls filters={filters} setFilters={setFilters} /> : null}
                  <ViewMenu view={view} setView={setView} sub={sub} />
                </div>
              </div>

              {sub ? <SubscriptionDisclaimer /> : null}

              <div className="mt-5 rounded-xl border bg-card/50 px-3 pt-4 pb-3 sm:px-5">
                {rows.length ? (
                  <CostScoreChart
                    rows={rows}
                    palette={palette}
                    mode={filters.mode}
                    scale={view.scale}
                    showFrontier={view.showFrontier}
                    highlight={hovered}
                    height={wide ? 640 : 460}
                    compact={!wide}
                    showCard={view.showCard}
                    dimOnHover={view.dimOnHover}
                    showLabels={view.showLabels}
                    dimUnpriced={view.dimUnpriced}
                    currency={currency}
                    scoreLabel={benchmark.scoreLabel}
                    scoreUnit={benchmark.scoreUnit}
                  />
                ) : (
                  <div className="grid h-[460px] place-items-center text-sm text-muted-foreground">Nothing to plot. Pick some models or loosen the plan filters.</div>
                )}
                <Legend
                  showUnpriced={sub}
                  dimUnpriced={view.dimUnpriced}
                  showFrontier={view.showFrontier}
                  palette={palette}
                />
              </div>
            </section>

            <section id="leaderboard">
              <ResultsTable rows={rows} mode={filters.mode} palette={palette} />
            </section>

            <section id="method" className="scroll-mt-20">
              <Method />
            </section>
              </>
            )}

            <footer className="flex flex-wrap justify-between gap-2 border-t pt-4 text-[12px] text-muted-foreground">
              <span>
                Data from{" "}
                <a className="text-foreground hover:underline" href={benchmark.source.url} target="_blank" rel="noreferrer">
                  {benchmark.source.name}
                </a>{" "}
                and{" "}
                <a className="text-foreground hover:underline" href={data.sources.pricing.url} target="_blank" rel="noreferrer">
                  Real API Pricing
                </a>{" "}
                ({data.sources.pricing.snapshot})
                {currency !== "USD" ? (
                  <>
                    {" "}
                    · prices converted from USD at 1 USD = {data.fx.rates[currency]} {currency} ({data.fx.source}, {data.fx.date})
                  </>
                ) : null}
              </span>
            </footer>
          </main>

          {/* Sticky offset = header (56px + 1px border) + main's top padding (20px), so the panel doesn't jump when scrolling starts. */}
          <aside className="relative lg:sticky lg:top-[77px] lg:max-h-[calc(100dvh-97px)] lg:self-start lg:overflow-y-auto lg:rounded-xl lg:border lg:bg-card/50">
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              title="Drag to resize, double-click to reset"
              onPointerDown={startResize}
              onDoubleClick={resetWidth}
              className="absolute inset-y-0 left-0 z-20 hidden w-1.5 cursor-col-resize rounded-full transition-colors hover:bg-primary/40 active:bg-primary/60 lg:block"
            />
            <Sidebar
              filters={filters}
              setFilters={setFilters}
              palette={palette}
              highlight={hovered}
              onHover={setHovered}
              onReset={() => setFilters(INITIAL_FILTERS)}
              showPlans={sub || onPlans}
              models={models}
            />
          </aside>
        </div>
      </div>
    </TooltipProvider>
  )
}

/** "28 Oct 2026" from an ISO date, read as a calendar date (no timezone shift). */
const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

/** Caveat shown above the chart whenever prices are subscription estimates rather than measured API costs. */
function SubscriptionDisclaimer() {
  return (
    <div role="note" className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-[13px] leading-relaxed">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Subscription costs are rough estimates.</span> They scale each benchmark's API cost by how many
        tokens a plan allows, which assumes you use the whole monthly allowance and relies on community-measured (sometimes estimated) limits that providers
        change without notice. Data last updated {formatDate(LAST_UPDATED)}.{" "}
        <a
          href="#method"
          onClick={(e) => {
            e.preventDefault()
            document.getElementById("method")?.scrollIntoView({ behavior: "smooth", block: "start" })
          }}
          className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
        >
          How these are computed
        </a>
      </p>
    </div>
  )
}

function UpdatedBadge() {
  return (
    <Hint
      content={
        <div className="space-y-0.5">
          {SOURCE_DATES.map((s) => (
            <div key={s.name}>
              {s.name}: {formatDate(s.date)}
            </div>
          ))}
        </div>
      }
    >
      <span tabIndex={0} className="hidden cursor-default border-l pl-4 text-[12px] text-muted-foreground sm:inline">
        Updated {formatDate(LAST_UPDATED)}
      </span>
    </Hint>
  )
}

function PageHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">{detail}</p>
    </div>
  )
}

function BenchmarkSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 gap-2 px-3 text-[15px] font-semibold" aria-label="Benchmark">
        {/* SelectValue with custom children: Radix needs the node to position the menu. */}
        <SelectValue>{benchmarkById(value).name}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {data.benchmarks.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            <span className="flex flex-col">
              <span className="font-medium">{b.name}</span>
              <span className="text-[12px] text-muted-foreground">{b.detail}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Info({ info }: { info: ReactNode }) {
  return (
    <Hint content={info}>
      <button type="button" aria-label="What is this?" className="text-muted-foreground/70 hover:text-foreground">
        <InfoIcon className="size-3.5" />
      </button>
    </Hint>
  )
}

interface ViewOptions {
  scale: XScale
  showFrontier: boolean
  showLabels: boolean
  /** Fade models with no plan in range (API-priced fallbacks) in subscription mode. */
  dimUnpriced: boolean
  showCard: boolean
  dimOnHover: boolean
}

const DEFAULT_VIEW: ViewOptions = {
  scale: "log",
  showFrontier: true,
  showLabels: true,
  dimUnpriced: true,
  showCard: true,
  dimOnHover: true,
}

type ViewToggle = Exclude<keyof ViewOptions, "scale">

function ViewMenu({ view, setView, sub }: { view: ViewOptions; setView: (update: (v: ViewOptions) => ViewOptions) => void; sub: boolean }) {
  const option = (key: ViewToggle, label: string, hint: string) => (
    <DropdownMenuCheckboxItem
      checked={view[key]}
      onCheckedChange={(on) => setView((v) => ({ ...v, [key]: on === true }))}
      onSelect={(e) => e.preventDefault()}
    >
      <span className="flex flex-col">
        {label}
        <span className="text-[12px] text-muted-foreground">{hint}</span>
      </span>
    </DropdownMenuCheckboxItem>
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-[13px] transition-colors hover:bg-accent data-[state=open]:bg-accent">
        <SlidersHorizontalIcon className="size-3.5" />
        View
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-[12px] text-muted-foreground">Cost axis</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={view.scale} onValueChange={(s) => setView((v) => ({ ...v, scale: s as XScale }))}>
          <DropdownMenuRadioItem value="log">Log scale</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="linear">Linear scale</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[12px] text-muted-foreground">Chart</DropdownMenuLabel>
        {option("showFrontier", "Pareto line", "Best score available at each price")}
        {option("showLabels", "Model labels", "Name each model beside its best point")}
        {sub ? option("dimUnpriced", "Dim models with no plan in range", "Fade the hollow, API-priced models") : null}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[12px] text-muted-foreground">On hover</DropdownMenuLabel>
        {option("showCard", "Detail card", "Score, plan and prices for the hovered point")}
        {option("dimOnHover", "Dim other models", "Fade every other line while hovering")}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BudgetControls({ filters, setFilters }: { filters: Filters; setFilters: (u: (f: Filters) => Filters) => void }) {
  const patch = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }))
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          Max cost
          <Info info="Ignore any plan whose monthly fee is above this. Slide down to see what the best model costs per task on a cheaper budget." />
        </span>
        <Slider
          className="w-40"
          min={0}
          max={MAX_FEE}
          step={5}
          value={[filters.maxFee]}
          onValueChange={([v]) => patch({ maxFee: v })}
          aria-label="Maximum monthly subscription cost"
        />
        <span className="min-w-12 text-[13px] font-medium tabular-nums">{filters.maxFee >= MAX_FEE ? "Any" : `${feeShort(filters.maxFee)}/mo`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          Brackets
          <Info info="Monthly-fee bands. Untick a band to drop every plan priced in it, e.g. keep only 20x-tier plans." />
        </span>
        <BracketSelect value={filters.brackets} onChange={(brackets) => patch({ brackets })} />
      </div>
    </div>
  )
}

/** Select-style multi-pick for fee brackets; stays open while ticking. */
function BracketSelect({ value, onChange }: { value: ReadonlySet<BracketId>; onChange: (next: Set<BracketId>) => void }) {
  const all = value.size === BRACKETS.length
  const summary = all ? "All" : value.size === 0 ? "None" : BRACKETS.filter((b) => value.has(b.id)).map((b) => bracketLabel(b)).join(", ")
  const toggle = (id: BracketId, on: boolean) => {
    const next = new Set(value)
    if (on) next.add(id)
    else next.delete(id)
    onChange(next)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 max-w-52 items-center gap-2 rounded-md border bg-transparent px-2.5 text-[13px] transition-colors hover:bg-accent data-[state=open]:bg-accent dark:bg-input/30">
        <span className="truncate tabular-nums">{summary}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {BRACKETS.map((b) => (
          <DropdownMenuCheckboxItem key={b.id} checked={value.has(b.id)} onCheckedChange={(v) => toggle(b.id, v === true)} onSelect={(e) => e.preventDefault()}>
            <span className="flex w-full items-baseline justify-between gap-3">
              <span className="tabular-nums">{bracketLabel(b)}</span>
              <span className="text-[12px] text-muted-foreground">{b.hint}</span>
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={all} onCheckedChange={() => onChange(new Set(all ? [] : BRACKETS.map((b) => b.id)))} onSelect={(e) => e.preventDefault()}>
          All brackets
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Legend({
  showUnpriced,
  dimUnpriced,
  showFrontier,
  palette,
}: {
  showUnpriced: boolean
  dimUnpriced: boolean
  showFrontier: boolean
  palette: ChartPalette
}) {
  const groups: LabGroup[] = ["OpenAI", "Anthropic", "Other labs"]
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 text-[12px] text-muted-foreground">
      {groups.map((g) => (
        <span key={g} className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 rounded-full" style={{ background: palette[g] }} />
          {g}
        </span>
      ))}
      {showUnpriced || showFrontier ? <span className="hidden h-3 w-px bg-border sm:block" /> : null}
      {showUnpriced ? (
        <span className="inline-flex items-center gap-1.5">
          {/* Same treatment as the chart: hollow point, and faded line when dimming is on. */}
          <svg viewBox="0 0 22 10" className="h-2.5 w-[22px] overflow-visible" style={{ opacity: dimUnpriced ? 0.4 : 1 }} aria-hidden="true">
            <line x1="0" y1="5" x2="14" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="17" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          {dimUnpriced ? "dimmed: no plan in range, shown at API price" : "no plan in range, API price"}
        </span>
      ) : null}
      {showFrontier ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 border-t border-dashed border-foreground/60" /> Pareto frontier
        </span>
      ) : null}
    </div>
  )
}

function PlansView({ filters, palette, models: all }: { filters: Filters; palette: ChartPalette; models: readonly Model[] }) {
  const models = all
    .filter((m) => filters.models.has(m.id))
    .sort((a, b) => Math.max(...b.efforts.map((e) => e.score)) - Math.max(...a.efforts.map((e) => e.score)))
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {models.map((m) => (
        <div key={m.id} className="rounded-xl border bg-card/50 p-4">
          <PlanBreakdown model={m} filters={filters} palette={palette} />
        </div>
      ))}
    </div>
  )
}

const CURRENCY_KEY = "danalytics-currency"

/** Display currency: a saved choice if there is one, otherwise USD (the data's own currency). */
function useStoredCurrency() {
  const [code, setCode] = useState<CurrencyCode>(() => {
    try {
      const saved = localStorage.getItem(CURRENCY_KEY)
      if (CURRENCIES.some((c) => c.code === saved)) return saved as CurrencyCode
    } catch {
      // Storage can be blocked; fall back to USD.
    }
    return "USD"
  })
  const choose = (next: CurrencyCode) => {
    setCode(next)
    try {
      localStorage.setItem(CURRENCY_KEY, next)
    } catch {
      // Storage can be blocked; the currency still applies for this visit.
    }
  }
  return [code, choose] as const
}

function CurrencySelect({ value, onChange }: { value: CurrencyCode; onChange: (c: CurrencyCode) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as CurrencyCode)}>
      <span className="hidden items-center gap-1.5 text-[13px] text-muted-foreground sm:flex">
        Currency
        <Info
          info={`Prices are in USD in the source data and simply converted at a fixed exchange rate (${data.fx.source}, ${data.fx.date}). They don't reflect what plans actually charge in that currency, which often differs because of local pricing and tax.`}
        />
      </span>
      <SelectTrigger size="sm" className="h-8 gap-1.5 text-[13px] font-medium tabular-nums" aria-label="Currency">
        {/* SelectValue with custom children: Radix needs the node to position the menu. */}
        <SelectValue>{value}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {CURRENCIES.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            <span className="font-medium tabular-nums">{c.code}</span>
            <span className="text-muted-foreground">{c.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ThemeSwitch({ pref, onChange }: { pref: ThemePref; onChange: (p: ThemePref) => void }) {
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={pref} onValueChange={(v) => v && onChange(v as ThemePref)} aria-label="Theme" className="ml-auto md:ml-0">
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
  const { pricing, reference } = data.sources
  return (
    <div className="max-w-3xl">
      <PageHeading title="Method" detail="Where the numbers come from and how a subscription task is priced" />
      <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <MethodSection title="The benchmarks">
          <p>
            <Em>Intelligence Index v5</Em> is Artificial Analysis's composite of nine evaluations. They run every reasoning-effort level of each model
            themselves and publish a score and an API cost per task, both used as-is.
          </p>
          <p>
            <Em>FrontierCode 2.0</Em> grades coding-agent changes the way a maintainer would. Scores and API costs per task are Cognition's own published runs.
            Models Cognition hasn't published yet (GPT-6.1 Terra, DeepSeek V4.1 Flash 1017) use Artificial Analysis's FrontierCode run instead.
          </p>
        </MethodSection>

        <MethodSection title="Pricing a subscription task">
          <p className="rounded-md border bg-card/50 px-3 py-2 font-mono text-[12.5px] text-foreground">
            subscription $/task = API $/task × plan $ per Mtok ÷ API $ per Mtok
          </p>
          <p>
            A plan's $ per Mtok is its monthly fee divided by the tokens it allows in a month, so the ratio is the share of list price a subscriber pays. Both
            sides use the same token mix (mostly cache reads, as in real agent sessions), and the plan side assumes you use the whole allowance; use half and each
            task costs twice as much. For each model and effort level, the cheapest plan that passes your filters wins.
          </p>
        </MethodSection>

        <MethodSection title="Allowances and confidence">
          <p>
            Allowances come from Real API Pricing, which measures them from usage dashboards, local logs and runs that use a plan up to its limit. Each is rated
            high, medium or low confidence. Low means a single report or an estimate carried over from another model or plan tier, for example Sonnet and Haiku
            on Claude plans, scaled from the measured Opus allowance by list price. These are included by default and can be switched off in the sidebar; the
            leaderboard marks them with ≈.
          </p>
        </MethodSection>

        <MethodSection title="Gaps and estimates">
          <p>
            GPT-6 Astra, Sol and 6.1 Sol have no published API price in the pricing data, so their per-token basis is implied from mypriors' ChatGPT Plus
            figures; GPT-6 Luna's is estimated from Factory Droid's price multipliers. For models that take FrontierCode results from Artificial Analysis, the
            cost per task is FrontierCode's share of their Intelligence Index cost, which matches Cognition's own figures within a few percent where both exist.
            Models with no plan in range, or no measured allowance at all, are shown at their API price.
          </p>
        </MethodSection>

        <MethodSection title="Currency">
          <p>
            All source prices are in US dollars. Other currencies are a straight conversion at a fixed ECB reference rate ({data.fx.date}), not what plans charge
            locally.
          </p>
        </MethodSection>

        <MethodSection title="Sources">
          <ul className="space-y-1">
            {data.benchmarks.map((b) => (
              <li key={b.id}>
                {b.name} scores and API costs:{" "}
                <a className="text-foreground underline underline-offset-2" href={b.source.url} target="_blank" rel="noreferrer">
                  {b.source.name}
                </a>
                {b.source.fetched ? ` (fetched ${b.source.fetched})` : null}
              </li>
            ))}
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
        </MethodSection>
      </div>
    </div>
  )
}

function MethodSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

const Em = ({ children }: { children: ReactNode }) => <span className="font-medium text-foreground">{children}</span>
