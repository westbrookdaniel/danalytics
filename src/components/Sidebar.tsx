import { useEffect, useRef, useState, type ReactNode } from "react"
import { RotateCcwIcon, SearchIcon } from "lucide-react"
import { LAB_MARK, labOf } from "@/lib/colors"
import { BRACKETS, bracketOf, data, EFFORT_ORDER, labGroup, type GlmScenario, type Model, type PlanKind } from "@/lib/data"
import { EFFORT_LABEL, fee } from "@/lib/format"
import { planExclusion, type Filters } from "@/lib/pricing"
import { flip } from "@/lib/sets"
import type { ChartPalette } from "@/lib/theme"
import { cn } from "@/lib/utils"

interface Props {
  filters: Filters
  setFilters: (update: (f: Filters) => Filters) => void
  palette: ChartPalette
  highlight: string | null
  onHover: (modelId: string | null) => void
  onReset: () => void
  /** Plan controls only matter when the chart is priced by subscription. */
  showPlans: boolean
}

const EFFORTS = EFFORT_ORDER.filter((e) => data.models.some((m) => m.efforts.some((x) => x.effort === e)))
const bestScore = (m: Model) => Math.max(...m.efforts.map((e) => e.score))
const byScore = (a: Model, b: Model) => bestScore(b) - bestScore(a)

export function Sidebar({ filters, setFilters, palette, highlight, onHover, onReset, showPlans }: Props) {
  const [query, setQuery] = useState("")
  const search = useRef<HTMLInputElement>(null)
  const patch = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }))

  // "/" jumps to model search, as on most data tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.key === "/" && !typing) {
        e.preventDefault()
        search.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const q = query.trim().toLowerCase()
  const matches = (m: Model) => !q || m.name.toLowerCase().includes(q) || labOf(m).toLowerCase().includes(q)
  const current = data.models.filter((m) => !m.superseded && matches(m)).sort(byScore)
  const older = data.models.filter((m) => m.superseded && matches(m)).sort(byScore)

  const setModels = (ids: string[], on: boolean) => {
    const next = new Set(filters.models)
    for (const id of ids) {
      if (on) next.add(id)
      else next.delete(id)
    }
    patch({ models: next })
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-medium">
          Models <span className="ml-1.5 text-[11px] font-normal text-muted-foreground tabular-nums">{filters.models.size}</span>
        </h2>
        <button type="button" onClick={onReset} title="Reset all filters" className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground">
          <RotateCcwIcon className="size-3.5" />
        </button>
      </div>

      <label className="-mt-2 flex items-center gap-2 border-b pb-2 text-[12.5px] text-muted-foreground focus-within:border-foreground/40">
        <SearchIcon className="size-3.5 shrink-0" />
        <input
          ref={search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder="Find models"
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
        <kbd className="font-sans text-[11px]">/</kbd>
      </label>

      <Group title="Reasoning">
        <div className="flex flex-wrap gap-x-2.5 gap-y-1">
          {EFFORTS.map((e) => (
            <TextToggle
              key={e}
              on={filters.efforts.has(e)}
              onClick={() => patch({ efforts: flip(filters.efforts, e) })}
              onDoubleClick={() => patch({ efforts: new Set([e]) })}
              title="Click to toggle, double-click to show only this level"
            >
              {EFFORT_LABEL[e] ?? e}
            </TextToggle>
          ))}
        </div>
        <TextToggle on={filters.bestEffortOnly} onClick={() => patch({ bestEffortOnly: !filters.bestEffortOnly })} strike={false} className="mt-1 text-[12px]">
          {filters.bestEffortOnly ? "✓ " : ""}Best effort only
        </TextToggle>
      </Group>

      <ModelGroup
        title="Current"
        models={current}
        {...{ filters, palette, highlight, onHover }}
        onToggle={(id) => setModels([id], !filters.models.has(id))}
        onAll={(on) => setModels(current.map((m) => m.id), on)}
      />
      {older.length ? (
        <ModelGroup
          title="Older"
          models={older}
          {...{ filters, palette, highlight, onHover }}
          onToggle={(id) => setModels([id], !filters.models.has(id))}
          onAll={(on) => setModels(older.map((m) => m.id), on)}
        />
      ) : null}

      {showPlans ? <PlanControls filters={filters} patch={patch} setFilters={setFilters} /> : null}
    </div>
  )
}

function ModelGroup({
  title,
  models,
  filters,
  palette,
  highlight,
  onHover,
  onToggle,
  onAll,
}: Pick<Props, "filters" | "palette" | "highlight" | "onHover"> & {
  title: string
  models: Model[]
  onToggle: (id: string) => void
  onAll: (on: boolean) => void
}) {
  const allOn = models.every((m) => filters.models.has(m.id))
  return (
    <Group title={title} action={<HeadAction onClick={() => onAll(!allOn)}>{allOn ? "None" : "All"}</HeadAction>}>
      <div className="-mx-1.5">
        {models.map((m) => {
          const on = filters.models.has(m.id)
          const color = palette[labGroup(m)]
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(m.id)}
              onMouseEnter={() => on && onHover(m.id)}
              onMouseLeave={() => onHover(null)}
              className={cn(
                "flex min-h-[26px] w-full items-center gap-2.5 rounded-[5px] px-1.5 text-left text-[12.5px] transition-colors hover:bg-accent",
                on ? "text-foreground" : "text-muted-foreground",
                highlight === m.id && "bg-accent",
              )}
            >
              <span className={cn("grid size-4 shrink-0 place-items-center rounded-[4px] border text-[9px] font-semibold", !on && "opacity-60")}>
                {LAB_MARK[labOf(m)] ?? "·"}
              </span>
              <span className="min-w-0 flex-1 truncate">{m.short}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">{bestScore(m).toFixed(1)}</span>
              <span
                className="size-[7px] shrink-0 rounded-full"
                style={{ background: on ? color : "transparent", boxShadow: `inset 0 0 0 1px ${color}`, opacity: on ? 1 : 0.6 }}
              />
            </button>
          )
        })}
      </div>
    </Group>
  )
}

function PlanControls({ filters, patch, setFilters }: { filters: Filters; patch: (p: Partial<Filters>) => void; setFilters: Props["setFilters"] }) {
  const plans = data.plans.filter((p) => !p.scenario || p.scenario === filters.glmScenario)
  const inPlay = plans.filter((p) => !planExclusion(p, filters)).length
  const modelNames = new Map(data.models.map((m) => [m.id, m.short]))
  const kinds: { id: PlanKind; label: string }[] = [
    { id: "lab", label: "Lab plans" },
    { id: "tool", label: "Third-party tools" },
  ]
  const glm: { id: GlmScenario; label: string }[] = [
    { id: "peak", label: "peak" },
    { id: "mid", label: "blended" },
    { id: "offpeak", label: "off-peak" },
  ]

  const togglePlan = (id: string) =>
    setFilters((f) => ({ ...f, disabledPlans: flip(f.disabledPlans, id) }))

  return (
    <>
      <div className="h-px bg-border" />
      <Group title={<>Plans <span className="ml-1 font-normal text-muted-foreground tabular-nums">{inPlay}/{plans.length}</span></>}>
        <div className="flex flex-wrap gap-x-2.5 gap-y-1">
          {kinds.map((k) => (
            <TextToggle key={k.id} on={filters.kinds.has(k.id)} onClick={() => patch({ kinds: flip(filters.kinds, k.id) })}>
              {k.label}
            </TextToggle>
          ))}
          <TextToggle on={filters.includeLegacy} onClick={() => patch({ includeLegacy: !filters.includeLegacy })} title="GLM existing-customer prices, Kimi v1 plans">
            Legacy
          </TextToggle>
          <TextToggle
            on={!filters.hideLowConfidence}
            onClick={() => patch({ hideLowConfidence: !filters.hideLowConfidence })}
            title="Allowances backed by a single report or a cross-plan assumption"
          >
            Low-confidence
          </TextToggle>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[12px]">
          <span className="text-muted-foreground">GLM hours</span>
          {glm.map((g) => (
            <TextToggle key={g.id} on={filters.glmScenario === g.id} onClick={() => patch({ glmScenario: g.id })} strike={false}>
              {g.label}
            </TextToggle>
          ))}
        </div>
      </Group>

      {BRACKETS.map((b) => {
        const inBracket = plans.filter((p) => bracketOf(p.fee) === b.id)
        if (!inBracket.length) return null
        return (
          <Group key={b.id} title={b.label} hint={b.hint}>
            <div className="-mx-1.5">
              {inBracket.map((plan) => {
                const reason = planExclusion(plan, filters)
                const on = !reason
                return (
                  <button
                    key={plan.id}
                    type="button"
                    aria-pressed={!filters.disabledPlans.has(plan.id)}
                    onClick={() => togglePlan(plan.id)}
                    title={`${reason ? `${reason}. ` : ""}Serves ${plan.offers.map((o) => modelNames.get(o.modelId)).join(", ")}`}
                    className={cn(
                      "flex min-h-[26px] w-full items-center gap-2.5 rounded-[5px] px-1.5 text-left text-[12.5px] transition-colors hover:bg-accent",
                      on ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span className={cn("min-w-0 flex-1 truncate", filters.disabledPlans.has(plan.id) && "line-through")}>{plan.name}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{fee(plan.fee)}</span>
                    <span className={cn("size-[7px] shrink-0 rounded-full border border-foreground/60", on && "bg-foreground/80")} />
                  </button>
                )
              })}
            </div>
          </Group>
        )
      })}
    </>
  )
}

function Group({ title, hint, action, children }: { title: ReactNode; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[12px] font-semibold">
          {title} {hint ? <span className="ml-1 font-normal text-muted-foreground">{hint}</span> : null}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function HeadAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-[11px] text-muted-foreground hover:text-foreground">
      {children}
    </button>
  )
}

/** Text-only toggle: full ink when on, muted (and struck through by default) when off. */
export function TextToggle({
  on,
  strike = true,
  className,
  children,
  ...rest
}: { on: boolean; strike?: boolean; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={on}
      {...rest}
      className={cn(
        "text-[12px] font-medium transition-colors hover:text-foreground",
        on ? "text-foreground" : cn("text-muted-foreground/70", strike && "line-through"),
        className,
      )}
    >
      {children}
    </button>
  )
}

