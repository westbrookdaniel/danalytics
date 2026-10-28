import { useEffect, useRef, useState, type ReactNode } from "react"
import { InfoIcon, RotateCcwIcon, SearchIcon } from "lucide-react"
import { Hint } from "@/components/Hint"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { LAB_MARK, labOf } from "@/lib/colors"
import { BRACKETS, bracketOf, data, EFFORT_ORDER, labGroup, type GlmScenario, type Model } from "@/lib/data"
import { EFFORT_LABEL, fee } from "@/lib/format"
import { lowConfidenceModels, planExclusion, type Filters } from "@/lib/pricing"
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
const modelNames = new Map(data.models.map((m) => [m.id, m.short]))

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
    <div className="flex flex-col gap-6 p-5">
      <div className="flex items-center gap-2">
        <h2 className="flex flex-1 items-center gap-2 text-[15px] leading-none font-semibold">
          Models
          <span className="rounded-md bg-muted px-1.5 py-1 text-[11px] leading-none font-medium text-muted-foreground tabular-nums">{filters.models.size}</span>
        </h2>
        <Hint content="Reset every filter to its default">
          <button type="button" onClick={onReset} aria-label="Reset all filters" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <RotateCcwIcon className="size-3.5" />
          </button>
        </Hint>
      </div>

      <div className="relative -mt-2">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder="Find a model or lab"
          className="h-8 pr-7 pl-8 text-[13px]"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-sans text-[11px] text-muted-foreground">/</kbd>
      </div>

      <Section
        title="Reasoning effort"
        info="Each model was run at several reasoning-effort settings; every point on a line is one setting. Turn levels off to drop those points. Double-click a level to show only it."
      >
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          spacing={1}
          className="flex w-full flex-wrap"
          value={[...filters.efforts]}
          onValueChange={(v) => patch({ efforts: new Set(v) })}
        >
          {EFFORTS.map((e) => (
            <ToggleGroupItem key={e} value={e} onDoubleClick={() => patch({ efforts: new Set([e]) })} className="h-7 px-2 text-[12px]">
              {EFFORT_LABEL[e] ?? e}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

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
    <Section
      title={title}
      action={
        <button type="button" onClick={() => onAll(!allOn)} className="text-[12px] text-muted-foreground hover:text-foreground">
          {allOn ? "Hide all" : "Show all"}
        </button>
      }
    >
      <div className="-mx-2">
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
              title={m.name}
              className={cn(
                "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition-colors hover:bg-accent",
                on ? "text-foreground" : "text-muted-foreground",
                highlight === m.id && "bg-accent",
              )}
            >
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-[5px] border bg-background text-[10px] font-semibold", !on && "opacity-60")}>
                {LAB_MARK[labOf(m)] ?? "·"}
              </span>
              <span className="min-w-0 flex-1 truncate">{m.short}</span>
              <span className="text-[12px] text-muted-foreground tabular-nums">{bestScore(m).toFixed(1)}%</span>
              <span className="size-2 shrink-0 rounded-full" style={{ background: on ? color : "transparent", boxShadow: `inset 0 0 0 1.5px ${color}` }} />
            </button>
          )
        })}
      </div>
    </Section>
  )
}

function PlanControls({ filters, patch, setFilters }: { filters: Filters; patch: (p: Partial<Filters>) => void; setFilters: Props["setFilters"] }) {
  const plans = data.plans.filter((p) => !p.scenario || p.scenario === filters.glmScenario)
  const inPlay = plans.filter((p) => !planExclusion(p, filters)).length
  const toggleKind = (kind: "lab" | "tool") => patch({ kinds: flip(filters.kinds, kind) })
  const togglePlan = (id: string) => setFilters((f) => ({ ...f, disabledPlans: flip(f.disabledPlans, id) }))

  return (
    <>
      <div className="h-px bg-border" />
      <Section
        title={
          <>
            Plans <span className="ml-1 font-normal text-muted-foreground tabular-nums">{inPlay} of {plans.length} in play</span>
          </>
        }
        info="Each model is priced on the cheapest plan that survives every filter here and in the budget bar. Models with no surviving plan fall back to their API price."
      >
        <div className="space-y-2.5">
          <SwitchRow
            id="kind-lab"
            label="Lab plans"
            info="Subscriptions sold by the model's own lab: Claude, ChatGPT, SuperGrok, Google AI Pro, Kimi, GLM Coding and Devin."
            checked={filters.kinds.has("lab")}
            onChange={() => toggleKind("lab")}
          />
          <SwitchRow
            id="kind-tool"
            label="Third-party tools"
            info="Coding tools that resell model access from a shared pool: Cursor, Factory Droid, OpenCode, Command Code and Ollama."
            checked={filters.kinds.has("tool")}
            onChange={() => toggleKind("tool")}
          />
          <SwitchRow
            id="legacy"
            label="Legacy pricing"
            info="Prices new customers can no longer buy: GLM's existing-customer rates and Kimi's v1 plans (replaced on 2026-10-26)."
            checked={filters.includeLegacy}
            onChange={(on) => patch({ includeLegacy: on })}
          />
          <SwitchRow
            id="low-conf"
            label="Low-confidence allowances"
            info="Allowances backed by a single report or a cross-plan assumption rather than a measurement. Turning this off skips those plan × model pairs, so affected models move to their next-cheapest measured plan. Plans marked ≈ have some."
            checked={!filters.hideLowConfidence}
            onChange={(on) => patch({ hideLowConfidence: !on })}
          />
        </div>
        <div className="flex items-center justify-between gap-3 pt-1">
          <LabelWithInfo label="GLM hours" info="Zhipu meters GLM Coding plans faster during Beijing peak hours. Blended assumes a typical day; off-peak assumes you only code outside peak." />
          <Select value={filters.glmScenario} onValueChange={(v) => patch({ glmScenario: v as GlmScenario })}>
            <SelectTrigger size="sm" className="h-8 w-32 text-[13px]" aria-label="GLM hours">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="peak">Peak hours</SelectItem>
              <SelectItem value="mid">Blended day</SelectItem>
              <SelectItem value="offpeak">Off-peak only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      {BRACKETS.map((b) => {
        const inBracket = plans.filter((p) => bracketOf(p.fee) === b.id)
        if (!inBracket.length) return null
        return (
          <Section key={b.id} title={b.label} hint={b.hint}>
            <div className="-mx-2">
              {inBracket.map((plan) => {
                const reason = planExclusion(plan, filters)
                const low = lowConfidenceModels(plan)
                const off = filters.disabledPlans.has(plan.id)
                const serves = plan.offers.map((o) => modelNames.get(o.modelId)).join(", ")
                return (
                  <Hint
                    key={plan.id}
                    side="left"
                    content={
                      <div className="space-y-1">
                        <div className="font-medium">
                          {plan.name} · {fee(plan.fee)}/mo
                        </div>
                        <div>Serves {serves}</div>
                        {low.length ? <div>≈ Low-confidence for {low.map((id) => modelNames.get(id)).join(", ")}</div> : null}
                        <div className="opacity-70">{reason ? `Out of play: ${reason.toLowerCase()}.` : "In play."} Click to turn this plan {off ? "on" : "off"}.</div>
                      </div>
                    }
                  >
                    <button
                      type="button"
                      aria-pressed={!off}
                      onClick={() => togglePlan(plan.id)}
                      className={cn(
                        "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition-colors hover:bg-accent",
                        reason ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      <span className={cn("size-2 shrink-0 rounded-full border-[1.5px] border-foreground/50", !reason && "border-foreground bg-foreground")} />
                      <span className={cn("min-w-0 flex-1 truncate", off && "line-through")}>{plan.name}</span>
                      {low.length ? <span className="text-[12px] text-muted-foreground">≈</span> : null}
                      <span className="text-[12px] text-muted-foreground tabular-nums">{fee(plan.fee)}</span>
                    </button>
                  </Hint>
                )
              })}
            </div>
          </Section>
        )
      })}
    </>
  )
}

function Section({ title, hint, info, action, children }: { title: ReactNode; hint?: string; info?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          {title}
          {hint ? <span className="font-normal text-muted-foreground">{hint}</span> : null}
          {info ? <InfoButton info={info} /> : null}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function InfoButton({ info }: { info: string }) {
  return (
    <Hint content={info}>
      <button type="button" aria-label="What is this?" className="text-muted-foreground/70 hover:text-foreground">
        <InfoIcon className="size-3.5" />
      </button>
    </Hint>
  )
}

function LabelWithInfo({ label, info, htmlFor }: { label: string; info: string; htmlFor?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px]">
      <label htmlFor={htmlFor}>{label}</label>
      <InfoButton info={info} />
    </span>
  )
}

function SwitchRow({ id, label, info, checked, onChange }: { id: string; label: string; info: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <LabelWithInfo label={label} info={info} htmlFor={id} />
      <Switch id={id} size="sm" checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
