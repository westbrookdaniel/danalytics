import { data, labGroup, type LabGroup } from "@/lib/data"
import type { ChartPalette } from "@/lib/theme"
import { cn } from "@/lib/utils"

interface Props {
  selected: ReadonlySet<string>
  onChange: (next: Set<string>) => void
  highlight: string | null
  onHighlight: (id: string | null) => void
  palette: ChartPalette
}

const GROUPS: LabGroup[] = ["OpenAI", "Anthropic", "Other labs"]

const PRESETS: { label: string; pick: () => string[] }[] = [
  { label: "Current", pick: () => data.models.filter((m) => !m.superseded).map((m) => m.id) },
  { label: "All", pick: () => data.models.map((m) => m.id) },
  { label: "Top 6", pick: () => topModels(6) },
  { label: "Open weights", pick: () => data.models.filter((m) => m.openWeights).map((m) => m.id) },
  { label: "None", pick: () => [] },
]

function topModels(n: number) {
  return [...data.models]
    .sort((a, b) => Math.max(...b.efforts.map((e) => e.score)) - Math.max(...a.efforts.map((e) => e.score)))
    .slice(0, n)
    .map((m) => m.id)
}

export function ModelPicker({ selected, onChange, highlight, onHighlight, palette }: Props) {
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Models · {selected.size}/{data.models.length}
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(new Set(p.pick()))}
            className="rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid gap-x-6 gap-y-2 md:grid-cols-3">
        {GROUPS.map((group) => (
          <div key={group} className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-2.5 rounded-full" style={{ background: palette[group] }} />
              {group}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.models
                .filter((m) => labGroup(m) === group)
                .map((m) => {
                  const on = selected.has(m.id)
                  const best = Math.max(...m.efforts.map((e) => e.score))
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(m.id)}
                      onDoubleClick={() => onHighlight(highlight === m.id ? null : m.id)}
                      title={`${m.name} · best ${best.toFixed(1)}%${m.superseded ? " · superseded" : ""}. Double-click to highlight.`}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                        on ? "border-foreground/25 bg-card text-foreground shadow-xs" : "border-dashed text-muted-foreground hover:text-foreground",
                        highlight === m.id && "ring-2 ring-ring",
                      )}
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ background: on ? palette[group] : "transparent", boxShadow: on ? undefined : `inset 0 0 0 1.5px ${palette[group]}` }}
                      />
                      {m.short}
                      <span className="tabular-nums text-muted-foreground">{best.toFixed(0)}</span>
                    </button>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
