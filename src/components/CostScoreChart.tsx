import { useMemo } from "react"
import { defineChart, dot, lineY, link, text, type ChartMark, type ChartMarkStateContext } from "@tanstack/charts"
import { tooltip } from "@tanstack/charts/tooltip"
import { Chart } from "@tanstack/charts/react/tooltip"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { scaleLog } from "d3-scale"
import { labGroup } from "@/lib/data"
import { cheaper, EFFORT_LABEL, fee, pct, tokens, usd } from "@/lib/format"
import { paretoFrontier, type Row } from "@/lib/pricing"
import type { ChartPalette } from "@/lib/theme"

/** A row with its plotted x position; unmetered (free) rows sit on a dedicated "Free" tick. */
type Plotted = Row & { x: number; apiX: number }
/** A model's best point plus where its gutter label landed after collision nudging. */
type Labelled = Plotted & { labelY: number; gutterX: number }

export type XScale = "log" | "linear"

interface Props {
  rows: readonly Row[]
  palette: ChartPalette
  mode: "subscription" | "api"
  scale: XScale
  showApiGhost: boolean
  showFrontier: boolean
  /** Model to emphasise, from a click or a sidebar hover. */
  highlight: string | null
  onSelectModel: (modelId: string | null) => void
  height: number
  /** Narrow screens label only the leading models. */
  compact: boolean
}

const PLOT_CHROME = 64 // top padding (clears the score caption) + x-axis band, in px
const LABEL_GAP = 15 // px between stacked gutter labels

/** 1-2-5 ticks across [lo, hi] for a log axis. */
function logTicks(lo: number, hi: number): number[] {
  const out: number[] = []
  for (let d = 10 ** Math.floor(Math.log10(lo)); d <= hi; d *= 10) {
    for (const m of [1, 2, 5]) {
      const v = d * m
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(Number(v.toPrecision(3)))
    }
  }
  return out
}

/** Pushes labels apart so each sits at least `gap` (score units) from its neighbours. */
function spreadLabels(labels: Labelled[], gap: number, floor: number) {
  labels.sort((a, b) => b.labelY - a.labelY)
  for (let i = 1; i < labels.length; i++) labels[i].labelY = Math.min(labels[i].labelY, labels[i - 1].labelY - gap)
  const last = labels.length - 1
  if (last >= 0 && labels[last].labelY < floor) {
    labels[last].labelY = floor
    for (let i = last - 1; i >= 0; i--) labels[i].labelY = Math.max(labels[i].labelY, labels[i + 1].labelY + gap)
  }
}

export function CostScoreChart(props: Props) {
  const { rows, palette, mode, scale, showApiGhost, showFrontier, highlight, onSelectModel, height, compact } = props

  const definition = useMemo(() => {
    const ghost = mode === "subscription" && showApiGhost
    const log = scale === "log"
    const costs = rows.flatMap((r) => [r.cost, ...(ghost ? [r.apiCost] : [])])
    const positive = costs.filter((v) => v > 0)
    const hasFree = log && rows.some((r) => r.cost === 0)
    const minPos = positive.length ? Math.min(...positive) : 0.01
    const maxCost = positive.length ? Math.max(...positive) : 1

    // Log axes start a touch under the cheapest point; free rows get their own tick further left.
    const lo = log ? minPos / 1.6 : 0
    const freeX = lo / 2.5
    const xMin = hasFree ? freeX : lo
    const xMax = log ? maxCost * 1.5 : maxCost * 1.06
    const tickValues = log ? [...(hasFree ? [freeX] : []), ...logTicks(lo, xMax)] : undefined

    const plotted: Plotted[] = rows.map((r) => ({ ...r, x: r.cost === 0 && log ? freeX : r.cost, apiX: r.apiCost }))
    const byModel = new Map<string, Plotted[]>()
    for (const r of plotted) byModel.set(r.modelId, [...(byModel.get(r.modelId) ?? []), r])

    const yTop = Math.max(10, Math.ceil((Math.max(0, ...rows.map((r) => r.score)) + 4) / 10) * 10)
    const color = (r: Row) => palette[labGroup(r.model)]

    const bests = [...byModel.values()].map((rs) => rs.reduce((a, b) => (b.score > a.score ? b : a)))
    const leaders = new Set([...bests].sort((a, b) => b.score - a.score).slice(0, 6).map((r) => r.modelId))
    const labels: Labelled[] = bests
      .filter((b) => !compact || leaders.has(b.modelId) || highlight === b.modelId)
      .map((b) => ({ ...b, labelY: b.score, gutterX: xMax }))
    spreadLabels(labels, (LABEL_GAP * yTop) / Math.max(120, height - PLOT_CHROME), 1)

    // Hovering any point dims every other model; a highlight does the same persistently.
    const focusedOther = (modelId: string) => (ctx: ChartMarkStateContext<Plotted>) => (ctx.focus.primary.datum as Plotted).modelId !== modelId
    const fade = (modelId: string) => (highlight && highlight !== modelId ? 0.12 : 1)

    const marks: ChartMark<Plotted, number, number>[] = []

    if (showFrontier) {
      const frontier = paretoFrontier(plotted) as Plotted[]
      if (frontier.length > 1) {
        marks.push(
          lineY(frontier, { id: "frontier", x: "x", y: "score", stroke: palette.frontier, strokeOpacity: 0.35, strokeWidth: 1, strokeDasharray: "3 4" }),
        )
      }
    }

    for (const label of labels) {
      const o = fade(label.modelId)
      marks.push(
        link([label], {
          id: `leader-${label.modelId}`,
          x1: "x",
          y1: "score",
          x2: "gutterX",
          y2: "labelY",
          stroke: palette.grid,
          strokeOpacity: o,
          strokeWidth: 1,
        }),
        text([label], {
          id: `label-${label.modelId}`,
          x: "gutterX",
          y: "labelY",
          text: (r) => r.model.short,
          dx: 10,
          anchor: "start",
          fontSize: 12,
          fontWeight: highlight === label.modelId ? 650 : 550,
          fill: color(label),
          states: [{ when: focusedOther(label.modelId), style: { opacity: 0.25 } }],
        }),
        dot([label], {
          id: `label-dot-${label.modelId}`,
          x: "gutterX",
          y: "labelY",
          r: 2.5,
          fill: color(label),
          fillOpacity: o,
          states: [{ when: focusedOther(label.modelId), style: { opacity: 0.25 } }],
        }),
      )
    }

    for (const [modelId, modelRows] of byModel) {
      const c = color(modelRows[0])
      const o = fade(modelId)
      const states = [{ when: focusedOther(modelId), style: { opacity: 0.12 } }]

      if (ghost) {
        const priced = modelRows.filter((r) => r.source !== "api")
        marks.push(
          link(priced, {
            id: `ghost-link-${modelId}`,
            x1: "apiX",
            y1: "score",
            x2: "x",
            y2: "score",
            stroke: c,
            strokeOpacity: 0.25 * o,
            strokeWidth: 1,
            strokeDasharray: "2 3",
          }),
          dot(priced, { id: `ghost-dot-${modelId}`, x: "apiX", y: "score", r: 2.75, fill: palette.surface, stroke: c, strokeOpacity: 0.45 * o, strokeWidth: 1.25, states }),
        )
      }

      marks.push(
        lineY(modelRows, { id: `line-${modelId}`, x: "x", y: "score", stroke: c, strokeWidth: highlight === modelId ? 2.5 : 1.75, strokeOpacity: 0.9 * o, states }),
      )
      const solid = modelRows.filter((r) => r.source !== "api" || mode === "api")
      const hollow = modelRows.filter((r) => r.source === "api" && mode !== "api")
      if (solid.length) {
        marks.push(
          dot(solid, { id: `dot-${modelId}`, x: "x", y: "score", r: 3.5, fill: c, fillOpacity: o, stroke: palette.surface, strokeWidth: 1.5, strokeOpacity: o, states }),
        )
      }
      if (hollow.length) {
        marks.push(
          dot(hollow, { id: `api-dot-${modelId}`, x: "x", y: "score", r: 3.25, fill: palette.surface, fillOpacity: o, stroke: c, strokeWidth: 1.75, strokeOpacity: o, states }),
        )
      }
    }

    return defineChart({
      marks,
      scales: {
        x: {
          scale: log ? scaleLog().domain([xMin, xMax]).clamp(true) : scaleLinear().domain([0, xMax]),
          grid: false,
          axis: {
            label: `${mode === "api" ? "API cost" : "Cost"} per task (USD, ${log ? "log" : "linear"} scale)`,
            line: { stroke: palette.grid },
            ticks: {
              size: 0,
              padding: 8,
              ...(tickValues ? { values: tickValues } : {}),
              format: (v: number) => (hasFree && v === freeX ? "Free" : usd(v)),
            },
          },
        },
        y: {
          scale: scaleLinear().domain([0, yTop]),
          grid: { stroke: palette.grid, strokeDasharray: "1 4", opacity: 1 },
          axis: { line: false, ticks: { size: 0, padding: 10, format: (v: number) => `${v}` } },
        },
      },
      margin: { top: 28, right: compact ? 112 : 150 },
      theme: { foreground: palette.ink, muted: palette.inkMuted, grid: palette.grid },
      focus: "nearest",
      maxFocusDistance: 28,
      tooltip: { use: tooltip, motion: false, className: "fc-tooltip" },
      svgAnimation: true,
    })
  }, [rows, palette, mode, scale, showApiGhost, showFrontier, highlight, height, compact])

  return (
    <Chart
      definition={definition}
      height={height}
      ariaLabel="FrontierCode 2.0 score against cost per task"
      ariaDescription="Each line is one model; points along it are reasoning-effort levels. Further left is cheaper, higher is better."
      onSelect={(point) => onSelectModel((point?.datum as Plotted | undefined)?.modelId ?? null)}
      renderTooltipBody={({ points }) => {
        const r = points[0]?.datum as Plotted | undefined
        return r ? <TooltipBody row={r} mode={mode} /> : null
      }}
    />
  )
}

function TooltipBody({ row, mode }: { row: Row; mode: "subscription" | "api" }) {
  const saving = row.source === "api" ? null : cheaper(row.apiCost, row.cost)
  return (
    <div className="min-w-52 space-y-2 text-xs">
      <div>
        <div className="text-[13px] font-semibold">{row.model.short}</div>
        <div className="text-muted-foreground">
          {EFFORT_LABEL[row.effort] ?? row.effort} effort · {row.model.harness}
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
        <dt className="text-muted-foreground">Score</dt>
        <dd className="text-right font-medium">{pct(row.score)}</dd>
        {mode === "subscription" && row.plan ? (
          <>
            <dt className="text-muted-foreground">{row.plan.name}</dt>
            <dd className="text-right font-medium">{usd(row.cost)} / task</dd>
            <dt className="text-muted-foreground">Plan fee</dt>
            <dd className="text-right">{fee(row.plan.fee)} / mo</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">API list price</dt>
        <dd className="text-right">{usd(row.apiCost)} / task</dd>
        <dt className="text-muted-foreground">Output tokens</dt>
        <dd className="text-right">{tokens(row.outputTokens)}</dd>
      </dl>
      {saving ? <div className="font-medium">{saving} cheaper than API</div> : null}
      {mode === "subscription" && row.source === "api" ? <div className="text-muted-foreground">No plan in range: shown at API price</div> : null}
      {row.offer?.unmetered && row.offer.promoUntil ? <div className="text-muted-foreground">Unmetered promo until {row.offer.promoUntil}</div> : null}
    </div>
  )
}
