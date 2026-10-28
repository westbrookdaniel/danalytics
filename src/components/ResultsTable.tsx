import { useState } from "react"
import { ArrowDownIcon } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
  highlight: string | null
  onHighlight: (id: string | null) => void
}

/** Score points per dollar; free rows sort first. */
const value = (r: Row) => (r.cost === 0 ? Infinity : r.score / r.cost)

export function ResultsTable({ rows, mode, palette, highlight, onHighlight }: Props) {
  const [sort, setSort] = useState<SortKey>("score")
  const sorted = [...rows].sort((a, b) =>
    sort === "score" ? b.score - a.score : sort === "cost" ? a.cost - b.cost || b.score - a.score : value(b) - value(a),
  )

  const header = (key: SortKey, label: string) => (
    <button type="button" onClick={() => setSort(key)} className={cn("inline-flex items-center gap-1", sort === key ? "text-foreground" : "hover:text-foreground")}>
      {label}
      {sort === key ? <ArrowDownIcon className="size-3" /> : null}
    </button>
  )

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">#</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Effort</TableHead>
          <TableHead className="text-right">{header("score", "Score")}</TableHead>
          {mode === "subscription" ? <TableHead>Cheapest plan in range</TableHead> : null}
          <TableHead className="text-right">{header("cost", mode === "subscription" ? "$ / task" : "API $ / task")}</TableHead>
          {mode === "subscription" ? <TableHead className="text-right">API $ / task</TableHead> : null}
          <TableHead className="text-right">{header("value", "Pts per $")}</TableHead>
          <TableHead className="text-right">Output tok</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((r, i) => {
          const saving = r.source === "api" ? null : cheaper(r.apiCost, r.cost)
          return (
            <TableRow
              key={r.key}
              data-state={highlight === r.modelId ? "selected" : undefined}
              onClick={() => onHighlight(highlight === r.modelId ? null : r.modelId)}
              className="cursor-pointer tabular-nums"
            >
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-2 font-medium">
                  <span className="size-2 rounded-full" style={{ background: palette[labGroup(r.model)] }} />
                  {r.model.short}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">{EFFORT_LABEL[r.effort] ?? r.effort}</TableCell>
              <TableCell className="text-right font-medium">{pct(r.score)}</TableCell>
              {mode === "subscription" ? (
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
              {mode === "subscription" ? <TableCell className="text-right text-muted-foreground">{usd(r.apiCost)}</TableCell> : null}
              <TableCell className="text-right">{r.cost === 0 ? "∞" : Math.round(value(r)).toLocaleString()}</TableCell>
              <TableCell className="text-right text-muted-foreground">{tokens(r.outputTokens)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
