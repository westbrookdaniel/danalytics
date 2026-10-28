import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { InfoIcon, MonitorIcon, MoonIcon, SlidersHorizontalIcon, SunIcon } from "lucide-react"
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
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TooltipProvider } from "@/components/ui/tooltip"
import { CostScoreChart, type XScale } from "@/components/CostScoreChart"
import { Hint } from "@/components/Hint"
import { PenguinMark } from "@/components/PenguinMark"
import { PlanBreakdown } from "@/components/PlanBreakdown"
import { ResultsTable } from "@/components/ResultsTable"
import { Sidebar } from "@/components/Sidebar"
import { BRACKETS, data, MAX_FEE, type BracketId, type LabGroup } from "@/lib/data"
import { buildRows, type Filters } from "@/lib/pricing"
import { CHART_COLORS, useTheme, type ChartPalette, type ThemePref } from "@/lib/theme"
import { cn } from "@/lib/utils"

type View = "subscription" | "api" | "plans" | "results" | "method"

/** Models that start hidden: niche or near-zero scorers that crowd the low end of the chart. */
const HIDDEN_BY_DEFAULT = new Set(["swe-2", "mistral-large-4", "inkling-small", "beam-1.0"])
/** Effort levels that start hidden: the extremes, which most people don't run day to day. */
const DEFAULT_EFFORTS = ["low", "medium", "high", "xhigh", "na"]

const INITIAL_FILTERS: Filters = {
  mode: "subscription",
  maxFee: MAX_FEE,
  brackets: new Set<BracketId>(BRACKETS.map((b) => b.id)),
  kinds: new Set(["lab", "tool"]),
  disabledPlans: new Set(),
  includeLegacy: false,
  hideLowConfidence: false,
  glmScenario: "mid",
  efforts: new Set(DEFAULT_EFFORTS),
  models: new Set(data.models.filter((m) => !m.superseded && !HIDDEN_BY_DEFAULT.has(m.id)).map((m) => m.id)),
}

const BENCHMARKS = [{ id: "frontiercode-2.0-main", name: "FrontierCode 2.0", detail: "Cognition · main subset · 132 tasks" }]

const VIEWS: { id: View; label: string }[] = [
  { id: "subscription", label: "Subscription cost" },
  { id: "api", label: "API cost" },
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

/**
 * Tracks an element's height so the chart can fill whatever space the layout leaves it.
 * A callback ref re-attaches the observer when the element remounts (e.g. after a tab switch).
 */
function useHeight() {
  const [height, setHeight] = useState(0)
  const [observer] = useState(() => new ResizeObserver(([entry]) => setHeight(Math.round(entry.contentRect.height))))
  useEffect(() => () => observer.disconnect(), [observer])
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      observer.disconnect()
      if (el) observer.observe(el)
    },
    [observer],
  )
  return [ref, height] as const
}

const SIDEBAR_KEY = "danalytics-sidebar-width"
const SIDEBAR_DEFAULT = 300
const clampWidth = (w: number) => Math.min(520, Math.max(240, w))

/** Drag-resizable sidebar width, remembered in localStorage. */
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
    const onMove = (ev: PointerEvent) => setWidth(clampWidth(window.innerWidth - ev.clientX))
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
  const [hovered, setHovered] = useState<string | null>(null)
  const wide = useWide()
  const [chartBox, boxHeight] = useHeight()

  const effective = useMemo(() => ({ ...filters, mode }), [filters, mode])
  const rows = useMemo(() => buildRows(effective), [effective])
  const charting = view === "subscription" || view === "api"
  const sub = mode === "subscription"
  const chartHeight = wide ? Math.max(420, boxHeight) : 460
  const [sidebarWidth, startResize, resetWidth] = useSidebarWidth()

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col bg-background lg:h-dvh">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <PenguinMark className="size-7" />
            <span className="text-[17px] font-semibold tracking-tight">danalytics</span>
          </div>
          <BenchmarkSelect />
          <nav className="flex h-full min-w-0 flex-1 items-stretch gap-5 overflow-x-auto pl-2 [scrollbar-width:none]">
            {VIEWS.map((v) => (
              <Tab key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
                {v.label}
              </Tab>
            ))}
            <span className="h-4 w-px shrink-0 self-center bg-border" />
            {DETAIL_VIEWS.map((v) => (
              <Tab key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
                {v.label}
              </Tab>
            ))}
          </nav>
          <ThemeSwitch pref={pref} onChange={setPref} />
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_var(--sidebar-w)]" style={{ "--sidebar-w": `${sidebarWidth}px` } as React.CSSProperties}>
          <main className="flex min-h-0 min-w-0 flex-col px-4 pt-5 pb-3 sm:px-6">
            {charting ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <h1 className="text-lg font-semibold tracking-tight">{sub ? "Score vs subscription cost per task" : "Score vs API cost per task"}</h1>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    {sub ? <BudgetControls filters={filters} setFilters={setFilters} /> : null}
                    <ViewMenu scale={scale} setScale={setScale} showFrontier={showFrontier} setShowFrontier={setShowFrontier} />
                  </div>
                </div>

                <div ref={chartBox} className="relative mt-4 min-h-[420px] flex-1">
                  <span className="pointer-events-none absolute top-0 left-1 z-10 text-[12px] font-medium text-muted-foreground">FrontierCode 2.0 score (%)</span>
                  <div className="absolute inset-0 max-lg:relative">
                    {rows.length ? (
                      <CostScoreChart
                        rows={rows}
                        palette={palette}
                        mode={mode}
                        scale={scale}
                        showFrontier={showFrontier}
                        highlight={hovered}
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
                <Legend sub={sub} showFrontier={showFrontier} palette={palette} />
              </>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto pb-6">
                {view === "plans" ? <PlansView filters={effective} palette={palette} /> : null}
                {view === "results" ? (
                  <>
                    <PageTitle title="All results" detail={`${rows.length} model × effort points · ${sub ? "subscription" : "API"} pricing`} />
                    <ResultsTable rows={rows} mode={mode} palette={palette} />
                  </>
                ) : null}
                {view === "method" ? <Method /> : null}
              </div>
            )}

            <footer className="mt-4 flex shrink-0 flex-wrap justify-between gap-2 border-t pt-3 text-[12px] text-muted-foreground">
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

          <aside className="relative min-h-0 border-t bg-card/40 lg:overflow-y-auto lg:border-t-0 lg:border-l lg:[scrollbar-width:thin]">
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              title="Drag to resize, double-click to reset"
              onPointerDown={startResize}
              onDoubleClick={resetWidth}
              className="absolute inset-y-0 left-0 z-20 hidden w-1.5 -translate-x-1/2 cursor-col-resize transition-colors hover:bg-primary/40 active:bg-primary/60 lg:block"
            />
            <Sidebar
              filters={filters}
              setFilters={setFilters}
              palette={palette}
              highlight={hovered}
              onHover={setHovered}
              onReset={() => setFilters(INITIAL_FILTERS)}
              showPlans={sub}
            />
          </aside>
        </div>
      </div>
    </TooltipProvider>
  )
}

function BenchmarkSelect() {
  const [value, setValue] = useState(BENCHMARKS[0].id)
  const current = BENCHMARKS.find((b) => b.id === value)!
  return (
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger size="sm" className="hidden h-8 gap-2 text-[13px] sm:flex" aria-label="Benchmark">
        <span className="font-medium">{current.name}</span>
        <span className="text-muted-foreground">main</span>
      </SelectTrigger>
      <SelectContent align="start">
        {BENCHMARKS.map((b) => (
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

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex shrink-0 items-center text-[13px] whitespace-nowrap transition-colors",
        active ? "font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
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

function ViewMenu({
  scale,
  setScale,
  showFrontier,
  setShowFrontier,
}: {
  scale: XScale
  setScale: (s: XScale) => void
  showFrontier: boolean
  setShowFrontier: (on: boolean) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-[13px] transition-colors hover:bg-accent data-[state=open]:bg-accent">
        <SlidersHorizontalIcon className="size-3.5" />
        View
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[12px] text-muted-foreground">Cost axis</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={scale} onValueChange={(v) => setScale(v as XScale)}>
          <DropdownMenuRadioItem value="log">Log scale</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="linear">Linear scale</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={showFrontier} onCheckedChange={(v) => setShowFrontier(v === true)}>
          <span className="flex flex-col">
            Pareto line
            <span className="text-[12px] text-muted-foreground">Best score available at each price</span>
          </span>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BudgetControls({ filters, setFilters }: { filters: Filters; setFilters: (u: (f: Filters) => Filters) => void }) {
  const patch = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }))
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          Max subscription
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
        <span className="w-16 text-[13px] font-medium tabular-nums">{filters.maxFee >= MAX_FEE ? "Any" : `$${filters.maxFee}/mo`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          Brackets
          <Info info="Monthly-fee bands. Turn a band off to drop every plan priced in it, e.g. keep only 20x-tier plans. Double-click a band to show only it." />
        </span>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          spacing={1}
          value={[...filters.brackets]}
          onValueChange={(v) => patch({ brackets: new Set(v as BracketId[]) })}
          className="flex-wrap"
        >
          {BRACKETS.map((b) => (
            <ToggleGroupItem key={b.id} value={b.id} onDoubleClick={() => patch({ brackets: new Set([b.id]) })} title={b.hint} className="h-7 px-2 text-[12px] tabular-nums">
              {b.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </>
  )
}

function Legend({ sub, showFrontier, palette }: { sub: boolean; showFrontier: boolean; palette: ChartPalette }) {
  const groups: LabGroup[] = ["OpenAI", "Anthropic", "Other labs"]
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-muted-foreground">
      {groups.map((g) => (
        <span key={g} className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 rounded-full" style={{ background: palette[g] }} />
          {g}
        </span>
      ))}
      <span className="hidden h-3 w-px bg-border sm:block" />
      <span>Points run low → high reasoning effort</span>
      {sub ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-muted-foreground" /> no plan in range, API price
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

function PageTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="text-[13px] text-muted-foreground">{detail}</p>
    </div>
  )
}

function PlansView({ filters, palette }: { filters: Filters; palette: ChartPalette }) {
  const models = data.models
    .filter((m) => filters.models.has(m.id))
    .sort((a, b) => Math.max(...b.efforts.map((e) => e.score)) - Math.max(...a.efforts.map((e) => e.score)))
  return (
    <>
      <PageTitle title="Plans by model" detail="Every plan that serves each model, priced at its best effort level. Faded plans are outside your filters; bars are log-scaled against the API price." />
      <div className="grid gap-4 xl:grid-cols-2">
        {models.map((m) => (
          <div key={m.id} className="rounded-xl border bg-card/40 p-4">
            <PlanBreakdown model={m} filters={filters} palette={palette} />
          </div>
        ))}
      </div>
    </>
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
    <div className="max-w-2xl space-y-4 text-sm leading-relaxed text-muted-foreground">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">How subscription costs are computed</h1>
      <p>
        <span className="font-medium text-foreground">Subscription $ / task</span> = Cognition's API $ / task × (plan's real $ per million tokens ÷ the model's
        API $ per million tokens), assuming the whole monthly allowance is used. Both per-token prices use Real API Pricing's standard workload (97% cache reads, 2.5% fresh input, 0.5%
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
