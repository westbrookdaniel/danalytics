import { useMemo, useState } from "react"
import { defineChart, dot, lineY, link, text, type ChartBounds, type ChartFocusStrategy, type ChartMark, type ChartMarkStateContext, type ChartPoint } from "@tanstack/charts"
import { Chart } from "@tanstack/charts/react"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { scaleLog } from "d3-scale"
import { LAB_MARK, labOf } from "@/lib/colors"
import { labGroup } from "@/lib/data"
import { cheaper, EFFORT_LABEL, fee, pct, tokens, usd } from "@/lib/format"
import { paretoFrontier, type Row } from "@/lib/pricing"
import type { ChartPalette } from "@/lib/theme"

/** A row with its plotted x position; unmetered (free) rows sit on a dedicated "Free" tick. */
type Plotted = Row & { x: number }
/** A model's best point plus where its gutter label landed after collision nudging. */
type Labelled = Plotted & { labelY: number; gutterX: number }

export type XScale = "log" | "linear"

interface Props {
  rows: readonly Row[]
  palette: ChartPalette
  mode: "subscription" | "api"
  scale: XScale
  showFrontier: boolean
  /** Model to emphasise, from a sidebar hover. */
  highlight: string | null
  height: number
  /** Narrow screens label only the leading models. */
  compact: boolean
}

/** Only effort points are hover targets; lines, labels and leaders share their positions or sit in the gutter. */
const isDataPoint = (p: ChartPoint) => p.markId.startsWith("dot-") || p.markId.startsWith("api-dot-")

/** Nearest effort point by straight-line pixel distance from the pointer. */
const nearestPoint: ChartFocusStrategy<Plotted, number, number> = {
  resolve: (points, { x, y, maxDistance }) => {
    let best: (typeof points)[number] | null = null
    let bestD = maxDistance * maxDistance
    for (const p of points) {
      if (!isDataPoint(p)) continue
      const d = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d <= bestD) {
        best = p
        bestD = d
      }
    }
    return best ? [best] : []
  },
  group: (_points, { point }) => [point],
  navigation: (points) => points.filter(isDataPoint).sort((a, b) => a.x - b.x || a.y - b.y),
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
  const { rows, palette, mode, scale, showFrontier, highlight, height, compact } = props

  const definition = useMemo(() => {
    const log = scale === "log"
    const positive = rows.map((r) => r.cost).filter((v) => v > 0)
    const hasFree = log && rows.some((r) => r.cost === 0)
    const minPos = positive.length ? Math.min(...positive) : 0.01
    const maxCost = positive.length ? Math.max(...positive) : 1

    // Log axes start a touch under the cheapest point; free rows get their own tick further left.
    const lo = log ? minPos / 1.6 : 0
    const freeX = lo / 2.5
    const xMin = hasFree ? freeX : lo
    const xMax = log ? maxCost * 1.5 : maxCost * 1.06
    const tickValues = log ? [...(hasFree ? [freeX] : []), ...logTicks(lo, xMax)] : undefined

    const plotted: Plotted[] = rows.map((r) => ({ ...r, x: r.cost === 0 && log ? freeX : r.cost }))
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
          dx: 11,
          anchor: "start",
          fontSize: 12.5,
          fontWeight: highlight === label.modelId ? 650 : 500,
          // Text has no opacity option, so a highlight elsewhere fades the label via its paint.
          fill: o < 1 ? palette.inkMuted : palette.ink,
          states: [{ when: focusedOther(label.modelId), style: { opacity: 0.25 } }],
        }),
        dot([label], {
          id: `label-dot-${label.modelId}`,
          x: "gutterX",
          y: "labelY",
          r: 3.5,
          fill: color(label),
          fillOpacity: o,
          states: [{ when: focusedOther(label.modelId), style: { opacity: 0.25 } }],
        }),
      )
    }

    for (const [modelId, modelRows] of byModel) {
      const c = color(modelRows[0])
      const o = fade(modelId)
      const states = [{ when: focusedOther(modelId), style: { opacity: 0.35 } }]

      marks.push(
        lineY(modelRows, { id: `line-${modelId}`, x: "x", y: "score", stroke: c, strokeWidth: highlight === modelId ? 3 : 2, strokeOpacity: 0.85 * o, states }),
      )
      const solid = modelRows.filter((r) => r.source !== "api" || mode === "api")
      const hollow = modelRows.filter((r) => r.source === "api" && mode !== "api")
      if (solid.length) {
        marks.push(
          dot(solid, { id: `dot-${modelId}`, x: "x", y: "score", r: 4.5, fill: c, fillOpacity: o, stroke: palette.surface, strokeWidth: 1.5, strokeOpacity: o, states }),
        )
      }
      if (hollow.length) {
        marks.push(
          dot(hollow, { id: `api-dot-${modelId}`, x: "x", y: "score", r: 4, fill: palette.surface, fillOpacity: o, stroke: c, strokeWidth: 2, strokeOpacity: o, states }),
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
      focus: nearestPoint,
      maxFocusDistance: 36,
      // The crosshair, enlarged point and detail card are drawn by the overlay below.
      focusRing: false,
      tooltip: false,
      svgAnimation: true,
    })
  }, [rows, palette, mode, scale, showFrontier, highlight, height, compact])

  // Focused point (in scene pixels) and the plot rectangle, for the hover overlay.
  const [focus, setFocus] = useState<ChartPoint<Plotted, number, number> | null>(null)
  const [plot, setPlot] = useState<{ bounds: ChartBounds; width: number; height: number } | null>(null)

  // Mouse clicks shouldn't move keyboard focus onto the chart (it would hold the last
  // hovered point after the pointer leaves); Tab still reaches it for keyboard use.
  return (
    <div className="relative" onMouseDown={(e) => e.preventDefault()}>
      <Chart
        definition={definition}
        height={height}
        ariaLabel="FrontierCode 2.0 score against cost per task"
        ariaDescription="Each line is one model; points along it are reasoning-effort levels. Further left is cheaper, higher is better."
        onFocusChange={(p) => setFocus(p as ChartPoint<Plotted, number, number> | null)}
        onRender={({ scene }) => {
          const b = scene.chart
          setPlot((prev) =>
            prev && prev.width === scene.width && prev.height === scene.height && prev.bounds.x === b.x && prev.bounds.y === b.y && prev.bounds.width === b.width && prev.bounds.height === b.height
              ? prev
              : { bounds: b, width: scene.width, height: scene.height },
          )
        }}
      />
      {focus && plot ? <HoverOverlay point={focus} plot={plot} palette={palette} mode={mode} /> : null}
    </div>
  )
}

function HoverOverlay({
  point,
  plot,
  palette,
  mode,
}: {
  point: ChartPoint<Plotted, number, number>
  plot: { bounds: ChartBounds; width: number; height: number }
  palette: ChartPalette
  mode: "subscription" | "api"
}) {
  const { bounds: b } = plot
  const r = point.datum
  const color = palette[labGroup(r.model)]
  const line = "pointer-events-none absolute border-dashed border-foreground/40"
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className={`${line} border-l`} style={{ left: point.x, top: b.y, height: b.height }} />
      <div className={`${line} border-t`} style={{ top: point.y, left: b.x, width: b.width }} />
      <span className="absolute -translate-y-full pb-1 text-[11px] font-medium tabular-nums" style={{ left: b.x + 6, top: point.y }}>
        {r.score.toFixed(1)}
      </span>
      <span className="absolute pb-1 text-[11px] font-medium tabular-nums" style={{ left: point.x + 6, top: b.y + b.height - 20 }}>
        {usd(r.cost)}
      </span>
      <span
        className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
        style={{ left: point.x, top: point.y, background: color, boxShadow: `0 0 0 1.5px ${color}` }}
      />
      <DetailCard row={r} mode={mode} style={{ right: plot.width - (b.x + b.width) + 12, bottom: plot.height - (b.y + b.height) + 12 }} />
    </div>
  )
}

function DetailCard({ row, mode, style }: { row: Row; mode: "subscription" | "api"; style: React.CSSProperties }) {
  const saving = row.source === "api" ? null : cheaper(row.apiCost, row.cost)
  const stat = (label: string, value: string, strong = false) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "text-right font-semibold" : "text-right"}>{value}</dd>
    </>
  )
  return (
    <div className="absolute w-64 rounded-xl border bg-popover/95 p-4 text-[12px] shadow-lg backdrop-blur" style={style}>
      <div className="flex items-center gap-2">
        <span className="grid size-5 place-items-center rounded-[5px] border bg-background text-[10px] font-semibold">{LAB_MARK[labOf(row.model)] ?? "·"}</span>
        <span className="text-[13px] font-semibold">{row.model.short}</span>
      </div>
      <div className="mt-0.5 text-muted-foreground">
        {EFFORT_LABEL[row.effort] ?? row.effort} effort · {row.model.harness}
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 tabular-nums">
        {stat("FrontierCode score", pct(row.score), true)}
        {mode === "subscription" && row.plan ? (
          <>
            {stat("Cost per task", usd(row.cost), true)}
            {stat("Plan", row.plan.name)}
            {stat("Plan fee", `${fee(row.plan.fee)} / mo`)}
          </>
        ) : null}
        {stat(mode === "subscription" ? "API price per task" : "Cost per task", usd(row.apiCost), mode === "api")}
        {saving ? stat("Saving vs API", saving) : null}
        {stat("Output tokens", tokens(row.outputTokens))}
      </dl>
      {mode === "subscription" && row.source === "api" ? <p className="mt-2.5 text-muted-foreground">No plan in range, so this is the API price.</p> : null}
      {row.offer?.unmetered && row.offer.promoUntil ? <p className="mt-2.5 text-muted-foreground">Unmetered promo until {row.offer.promoUntil}.</p> : null}
    </div>
  )
}
