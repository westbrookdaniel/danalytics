import { useState } from "react"
import { ArrowDownIcon } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { labGroup } from "@/lib/data"
import { cheaper, EFFORT_LABEL, fee, pct, tokens, usd } from "@/lib/format"
import type { Row } from "@/lib/pricing"
import type { ChartPalette } from "@/lib/theme"
import { cn } from "@/lib/utils"

type SortKey = "score" | "cost" | "value"

interface Props {
  rows: readonly Row[]
  mode: "subscription" | "api"
  palette: ChartPalette
}

/** Score points per dollar; free rows sort first. */
const value = (r: Row) => (r.cost === 0 ? Infinity : r.score / r.cost)

/** One row per model: its highest-scoring visible effort level. */
function bestPerModel(rows: readonly Row[]): Row[] {
  const best = new Map<string, Row>()
  for (const r of rows) {
    const cur = best.get(r.modelId)
    if (!cur || r.score > cur.score) best.set(r.modelId, r)
  }
  return [...best.values()]
}

export function ResultsTable({ rows, mode, palette }: Props) {
  const [sort, setSort] = useState<SortKey>("score")
  const [scope, setScope] = useState<"best" | "all">("best")
  const shown = scope === "best" ? bestPerModel(rows) : [...rows]
  const sorted = shown.sort((a, b) =>
    sort === "score" ? b.score - a.score : sort === "cost" ? a.cost - b.cost || b.score - a.score : value(b) - value(a),
  )
  const top = Math.max(1, ...rows.map((r) => r.score))
  const sub = mode === "subscription"

  const header = (key: SortKey, label: string) => (
    <button type="button" onClick={() => setSort(key)} className={cn("inline-flex items-center gap-1", sort === key ? "text-foreground" : "hover:text-foreground")}>
      {label}
      {sort === key ? <ArrowDownIcon className="size-3" /> : null}
    </button>
  )

  return (
    <div className="space-y-3">
      <ToggleGroup type="single" variant="outline" size="sm" value={scope} onValueChange={(v) => v && setScope(v as "best" | "all")} aria-label="Rows">
        <ToggleGroupItem value="best" className="h-7 px-2.5 text-[12px]">
          Best effort
        </ToggleGroupItem>
        <ToggleGroupItem value="all" className="h-7 px-2.5 text-[12px]">
          All effort levels
        </ToggleGroupItem>
      </ToggleGroup>
      <div className="rounded-xl border bg-card/50 px-2">
        <Table>
          <TableHeader>
            <TableRow className="text-[11px] tracking-wide uppercase hover:bg-transparent">
              <TableHead className="w-8">#</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="w-[28%]">{header("score", "Score")}</TableHead>
              {sub ? <TableHead>Cheapest plan</TableHead> : null}
              <TableHead className="text-right">{header("cost", sub ? "$ / task" : "API $ / task")}</TableHead>
              {sub ? <TableHead className="text-right">API $ / task</TableHead> : null}
              <TableHead className="text-right">{header("value", "Pts per $")}</TableHead>
              <TableHead className="text-right">Out tok</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r, i) => {
              const saving = r.source === "api" ? null : cheaper(r.apiCost, r.cost)
              const color = palette[labGroup(r.model)]
              return (
                <TableRow key={r.key} className="tabular-nums">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="font-medium">{r.model.short}</span>{" "}
                    <span className="text-muted-foreground">[{EFFORT_LABEL[r.effort] ?? r.effort}]</span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-3">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full" style={{ width: `${(r.score / top) * 100}%`, background: color }} />
                      </span>
                      <span className="w-12 text-right font-medium">{pct(r.score)}</span>
                    </span>
                  </TableCell>
                  {sub ? (
                    <TableCell className="max-w-48 truncate">
                      {r.plan ? (
                        <>
                          {r.plan.name} <span className="text-muted-foreground">{fee(r.plan.fee)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">API only</span>
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right font-medium">
                    {usd(r.cost)}
                    {saving ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{saving}</span> : null}
                  </TableCell>
                  {sub ? <TableCell className="text-right text-muted-foreground">{usd(r.apiCost)}</TableCell> : null}
                  <TableCell className="text-right">{r.cost === 0 ? "∞" : Math.round(value(r)).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{tokens(r.outputTokens)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
