import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { BRACKETS, MAX_FEE, type BracketId, type GlmScenario } from "@/lib/data"
import type { Filters } from "@/lib/pricing"

export interface ViewOptions {
  showApiGhost: boolean
  showFrontier: boolean
}

interface Props {
  filters: Filters
  setFilters: (update: (f: Filters) => Filters) => void
  view: ViewOptions
  setView: (update: (v: ViewOptions) => ViewOptions) => void
}

const FEE_PRESETS = [20, 60, 100, 200]

export function Controls({ filters, setFilters, view, setView }: Props) {
  const sub = filters.mode === "subscription"
  const patch = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }))

  return (
    <div className="space-y-6">
      <Tabs value={filters.mode} onValueChange={(v) => patch({ mode: v as Filters["mode"] })}>
        <TabsList className="w-full">
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="api">API list price</TabsTrigger>
        </TabsList>
      </Tabs>

      <fieldset disabled={!sub} className="space-y-6 disabled:opacity-45">
        <Section
          title="Max subscription cost"
          aside={<span className="text-sm font-semibold tabular-nums">{filters.maxFee >= MAX_FEE ? "Any" : `$${filters.maxFee} / mo`}</span>}
        >
          <Slider
            min={0}
            max={MAX_FEE}
            step={5}
            value={[filters.maxFee]}
            onValueChange={([v]) => patch({ maxFee: v })}
            aria-label="Maximum monthly subscription cost"
          />
          <div className="flex flex-wrap gap-1.5">
            {[...FEE_PRESETS, MAX_FEE].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => patch({ maxFee: v })}
                data-active={filters.maxFee === v}
                className="rounded-md border px-2 py-0.5 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[active=true]:border-foreground/40 data-[active=true]:bg-accent data-[active=true]:text-foreground"
              >
                {v === MAX_FEE ? "Any" : `$${v}`}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Price brackets" hint="Monthly fee bands to include">
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            spacing={1}
            className="flex w-full flex-wrap"
            value={[...filters.brackets]}
            onValueChange={(v) => patch({ brackets: new Set(v as BracketId[]) })}
          >
            {BRACKETS.map((b) => (
              <ToggleGroupItem key={b.id} value={b.id} title={b.hint} className="tabular-nums">
                {b.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Section>

        <Section title="Plan types">
          <Toggle
            id="kind-lab"
            label="Lab plans"
            hint="Claude, ChatGPT, SuperGrok, Kimi, GLM, Google, Devin"
            checked={filters.kinds.has("lab")}
            onChange={(on) => patch({ kinds: toggleSet(filters.kinds, "lab", on) })}
          />
          <Toggle
            id="kind-tool"
            label="Third-party tools"
            hint="Cursor, Factory Droid, OpenCode, Command Code, Ollama"
            checked={filters.kinds.has("tool")}
            onChange={(on) => patch({ kinds: toggleSet(filters.kinds, "tool", on) })}
          />
          <Toggle
            id="legacy"
            label="Legacy pricing"
            hint="GLM existing-customer prices, Kimi v1 plans"
            checked={filters.includeLegacy}
            onChange={(on) => patch({ includeLegacy: on })}
          />
          <Toggle
            id="low-conf"
            label="Hide low-confidence allowances"
            hint="Single reports or cross-plan assumptions"
            checked={filters.hideLowConfidence}
            onChange={(on) => patch({ hideLowConfidence: on })}
          />
        </Section>

        <Section
          title="Allowance used"
          hint="Subscriptions assume you burn the whole quota. Use half and each task costs double."
          aside={<span className="text-sm font-semibold tabular-nums">{Math.round(filters.utilization * 100)}%</span>}
        >
          <Slider
            min={10}
            max={100}
            step={5}
            value={[Math.round(filters.utilization * 100)]}
            onValueChange={([v]) => patch({ utilization: v / 100 })}
            aria-label="Share of monthly allowance used"
          />
        </Section>

        <Section title="GLM time of day" hint="Zhipu meters peak hours at a higher rate">
          <Select value={filters.glmScenario} onValueChange={(v) => patch({ glmScenario: v as GlmScenario })}>
            <SelectTrigger className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="peak">Peak hours</SelectItem>
              <SelectItem value="mid">Blended day</SelectItem>
              <SelectItem value="offpeak">Off-peak only</SelectItem>
            </SelectContent>
          </Select>
        </Section>
      </fieldset>

      <Separator />

      <Section title="Display">
        <Toggle
          id="best-effort"
          label="Best effort level only"
          hint="One point per model instead of an effort curve"
          checked={filters.bestEffortOnly}
          onChange={(on) => patch({ bestEffortOnly: on })}
        />
        <Toggle
          id="frontier"
          label="Pareto frontier"
          hint="Best score available at each price"
          checked={view.showFrontier}
          onChange={(on) => setView((v) => ({ ...v, showFrontier: on }))}
        />
        {sub ? (
          <>
            <Toggle
              id="ghost"
              label="Show API price ghosts"
              hint="Faint point at list price, linked to the subscription point"
              checked={view.showApiGhost}
              onChange={(on) => setView((v) => ({ ...v, showApiGhost: on }))}
            />
            <Toggle
              id="fallback"
              label="Fall back to API price"
              hint="Keep models with no plan in range, drawn hollow"
              checked={filters.apiFallback}
              onChange={(on) => patch({ apiFallback: on })}
            />
          </>
        ) : null}
      </Section>
    </div>
  )
}

function toggleSet<T>(set: ReadonlySet<T>, value: T, on: boolean): Set<T> {
  const next = new Set(set)
  if (on) next.add(value)
  else next.delete(value)
  return next
}

function Section({ title, hint, aside, children }: { title: string; hint?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {aside}
      </div>
      {hint ? <p className="-mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </section>
  )
}

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5 font-normal">
        <span className="text-sm">{label}</span>
        {hint ? <span className="text-xs leading-snug text-muted-foreground">{hint}</span> : null}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  )
}

