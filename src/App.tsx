import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { ChevronDownIcon, InfoIcon, MonitorIcon, MoonIcon, SlidersHorizontalIcon, SunIcon } from "lucide-react"
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
import { PenguinMark } from "@/components/PenguinMark"
import { PlanBreakdown } from "@/components/PlanBreakdown"
import { ResultsTable } from "@/components/ResultsTable"
import { Sidebar } from "@/components/Sidebar"
import { BRACKETS, data, MAX_FEE, type BracketId, type LabGroup } from "@/lib/data"
import { buildRows, type Filters } from "@/lib/pricing"
import { CHART_COLORS, useTheme, type ChartPalette, type ThemePref } from "@/lib/theme"

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

const SECTIONS = [
  { id: "chart", label: "Chart" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "plans", label: "Plans" },
  { id: "method", label: "Method" },
]

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
  const [scale, setScale] = useState<XScale>("log")
  const [showFrontier, setShowFrontier] = useState(true)
  const [showCard, setShowCard] = useState(true)
  const [dimOnHover, setDimOnHover] = useState(true)
  const [hovered, setHovered] = useState<string | null>(null)
  const wide = useWide()
  const [sidebarWidth, startResize, resetWidth] = useSidebarWidth()

  const rows = useMemo(() => buildRows(filters), [filters])
  const sub = filters.mode === "subscription"
  const setMode = (mode: Filters["mode"]) => setFilters((f) => ({ ...f, mode }))

  return (
    <TooltipProvider>
      <div className="min-h-dvh bg-background">
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
            <a href="#chart" className="flex items-center gap-2.5">
              <PenguinMark className="size-7" />
              <span className="text-[17px] font-semibold tracking-tight">danalytics</span>
            </a>
            <BenchmarkSelect />
            <nav className="ml-auto hidden items-center gap-5 md:flex">
              {SECTIONS.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                  {s.label}
                </a>
              ))}
            </nav>
            <ThemeSwitch pref={pref} onChange={setPref} />
          </div>
        </header>

        <div
          className="mx-auto grid max-w-[1600px] gap-8 px-4 pt-5 pb-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_var(--sidebar-w)]"
          style={{ "--sidebar-w": `${sidebarWidth}px` } as CSSProperties}
        >
          <main className="min-w-0 space-y-16">
            <section id="chart" className="scroll-mt-20">
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
                  cost per task
                </h1>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {sub ? <BudgetControls filters={filters} setFilters={setFilters} /> : null}
                  <ViewMenu
                    scale={scale}
                    setScale={setScale}
                    showFrontier={showFrontier}
                    setShowFrontier={setShowFrontier}
                    showCard={showCard}
                    setShowCard={setShowCard}
                    dimOnHover={dimOnHover}
                    setDimOnHover={setDimOnHover}
                  />
                </div>
              </div>

              <div className="mt-5 rounded-xl border bg-card/50 px-3 pt-4 pb-3 sm:px-5">
                {rows.length ? (
                  <CostScoreChart
                    rows={rows}
                    palette={palette}
                    mode={filters.mode}
                    scale={scale}
                    showFrontier={showFrontier}
                    highlight={hovered}
                    height={wide ? 640 : 460}
                    compact={!wide}
                    showCard={showCard}
                    dimOnHover={dimOnHover}
                  />
                ) : (
                  <div className="grid h-[460px] place-items-center text-sm text-muted-foreground">Nothing to plot. Pick some models or loosen the plan filters.</div>
                )}
                <Legend sub={sub} showFrontier={showFrontier} palette={palette} />
              </div>
            </section>

            <section id="leaderboard" className="scroll-mt-20">
              <ResultsTable rows={rows} mode={filters.mode} palette={palette} />
            </section>

            <section id="plans" className="scroll-mt-20">
              <SectionTitle
                title="Plans by model"
                detail="Every plan that serves each model, priced at its best effort level. Faded plans are outside your filters; bars are log-scaled against the API price."
              />
              <PlansView filters={filters} palette={palette} />
            </section>

            <section id="method" className="scroll-mt-20">
              <Method />
            </section>

            <footer className="flex flex-wrap justify-between gap-2 border-t pt-4 text-[12px] text-muted-foreground">
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
              <span>danalytics</span>
            </footer>
          </main>

          <aside className="relative lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:rounded-xl lg:border lg:bg-card/50">
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
              showPlans={sub}
            />
          </aside>
        </div>
      </div>
    </TooltipProvider>
  )
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mb-5 border-b pb-4">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">{detail}</p>
    </div>
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
  showCard,
  setShowCard,
  dimOnHover,
  setDimOnHover,
}: {
  scale: XScale
  setScale: (s: XScale) => void
  showFrontier: boolean
  setShowFrontier: (on: boolean) => void
  showCard: boolean
  setShowCard: (on: boolean) => void
  dimOnHover: boolean
  setDimOnHover: (on: boolean) => void
}) {
  const option = (checked: boolean, set: (on: boolean) => void, label: string, hint: string) => (
    <DropdownMenuCheckboxItem checked={checked} onCheckedChange={(v) => set(v === true)} onSelect={(e) => e.preventDefault()}>
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
        <DropdownMenuRadioGroup value={scale} onValueChange={(v) => setScale(v as XScale)}>
          <DropdownMenuRadioItem value="log">Log scale</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="linear">Linear scale</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {option(showFrontier, setShowFrontier, "Pareto line", "Best score available at each price")}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[12px] text-muted-foreground">On hover</DropdownMenuLabel>
        {option(showCard, setShowCard, "Detail card", "Score, plan and prices for the hovered point")}
        {option(dimOnHover, setDimOnHover, "Dim other models", "Fade every other line while hovering")}
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
          <Info info="Monthly-fee bands. Untick a band to drop every plan priced in it, e.g. keep only 20x-tier plans." />
        </span>
        <BracketSelect value={filters.brackets} onChange={(brackets) => patch({ brackets })} />
      </div>
    </>
  )
}

/** Select-style multi-pick for fee brackets; stays open while ticking. */
function BracketSelect({ value, onChange }: { value: ReadonlySet<BracketId>; onChange: (next: Set<BracketId>) => void }) {
  const all = value.size === BRACKETS.length
  const summary = all ? "All" : value.size === 0 ? "None" : BRACKETS.filter((b) => value.has(b.id)).map((b) => b.label).join(", ")
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
              <span className="tabular-nums">{b.label}</span>
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

function Legend({ sub, showFrontier, palette }: { sub: boolean; showFrontier: boolean; palette: ChartPalette }) {
  const groups: LabGroup[] = ["OpenAI", "Anthropic", "Other labs"]
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 text-[12px] text-muted-foreground">
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

function PlansView({ filters, palette }: { filters: Filters; palette: ChartPalette }) {
  const models = data.models
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
  const { benchmark, pricing, reference } = data.sources
  return (
    <div className="max-w-3xl">
      <SectionTitle title="Method" detail="How subscription costs per task are computed" />
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Subscription $ / task</span> = Cognition's API $ / task × (plan's real $ per million tokens ÷ the
          model's API $ per million tokens), assuming the whole monthly allowance is used. Both per-token prices use Real API Pricing's standard workload (97%
          cache reads, 2.5% fresh input, 0.5% output; Anthropic bills fresh input as cache writes, Google uses a low-cache mix), so the ratio is the share of list
          price a subscriber pays.
        </p>
        <p>
          Allowances are measured from dashboards, local logs and saturation runs where possible. The cheapest plan that passes your filters is picked per
          model. GPT-6 Astra, Sol and 6.1 Sol have no published API price in the dataset, so their per-token basis is implied from mypriors' ChatGPT Plus
          figures; GPT-6 Luna is estimated from Factory Droid multipliers. Models with no measurable allowance stay at API price, drawn hollow.
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
    </div>
  )
}
