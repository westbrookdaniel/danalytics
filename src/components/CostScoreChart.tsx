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

interface Props {
  rows: readonly Row[]
  palette: ChartPalette
  mode: "subscription" | "api"
  showApiGhost: boolean
  showFrontier: boolean
  highlight: string | null
  onHighlight: (modelId: string | null) => void
  height: number
  /** Narrow screens label only the leading models to keep labels from colliding. */
  compact: boolean
}

const decade = (v: number, round: (n: number) => number) => 10 ** round(Math.log10(v))

export function CostScoreChart({ rows, palette, mode, showApiGhost, showFrontier, highlight, onHighlight, height, compact }: Props) {
  const definition = useMemo(() => {
    const ghost = mode === "subscription" && showApiGhost
    const positive = rows.flatMap((r) => [r.cost, ...(ghost ? [r.apiCost] : [])]).filter((v) => v > 0)
    const hasFree = rows.some((r) => r.cost === 0)
    const lo = positive.length ? decade(Math.min(...positive), Math.floor) : 0.01
    const hi = positive.length ? decade(Math.max(...positive), Math.ceil) : 10
    // Place free rows half a decade left of the cheapest priced decade.
    const freeX = lo / Math.sqrt(10)
    const xMin = hasFree ? freeX : lo
    const decades: number[] = []
    for (let v = lo; v <= hi * 1.0001; v *= 10) decades.push(v)
    const tickValues = hasFree ? [freeX, ...decades] : decades

    const plotted: Plotted[] = rows.map((r) => ({ ...r, x: r.cost === 0 ? freeX : r.cost, apiX: r.apiCost }))
    const byModel = new Map<string, Plotted[]>()
    for (const r of plotted) byModel.set(r.modelId, [...(byModel.get(r.modelId) ?? []), r])

    const yTop = Math.max(10, Math.ceil((Math.max(0, ...rows.map((r) => r.score)) + 4) / 10) * 10)

    // Hovering any point dims every other model; a pinned highlight does the same persistently.
    const dimUnfocused = (modelId: string) => [
      {
        when: (ctx: ChartMarkStateContext<Plotted>) => (ctx.focus.primary.datum as Plotted).modelId !== modelId,
        style: { opacity: 0.14 },
      },
    ]
    const dimmed = (modelId: string) => (highlight && highlight !== modelId ? 0.14 : 1)

    const leaders = new Set(
      [...byModel.values()]
        .map((rs) => rs.reduce((a, b) => (b.score > a.score ? b : a)))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((r) => r.modelId),
    )
    const labelled = (modelId: string) => !compact || leaders.has(modelId) || highlight === modelId

    const marks: ChartMark<Plotted, number, number>[] = []

    if (showFrontier) {
      const frontier = paretoFrontier(plotted) as Plotted[]
      if (frontier.length > 1) {
        marks.push(
          lineY(frontier, {
            id: "frontier",
            x: "x",
            y: "score",
            stroke: palette.frontier,
            strokeOpacity: 0.45,
            strokeWidth: 1.25,
            strokeDasharray: "3 5",
          }),
        )
      }
    }

    for (const [modelId, modelRows] of byModel) {
      const color = palette[labGroup(modelRows[0].model)]
      const opacity = dimmed(modelId)
      const states = dimUnfocused(modelId)

      if (ghost) {
        const priced = modelRows.filter((r) => r.source !== "api")
        marks.push(
          link(priced, {
            id: `ghost-link-${modelId}`,
            x1: "apiX",
            y1: "score",
            x2: "x",
            y2: "score",
            stroke: color,
            strokeOpacity: 0.28 * opacity,
            strokeWidth: 1.25,
            strokeDasharray: "2 3",
          }),
          dot(priced, {
            id: `ghost-dot-${modelId}`,
            x: "apiX",
            y: "score",
            r: 3,
            fill: palette.surface,
            stroke: color,
            strokeOpacity: 0.45 * opacity,
            strokeWidth: 1.25,
            states,
          }),
        )
      }

      marks.push(
        lineY(modelRows, {
          id: `line-${modelId}`,
          x: "x",
          y: "score",
          stroke: color,
          strokeWidth: highlight === modelId ? 3 : 2,
          strokeOpacity: 0.85 * opacity,
          states,
        }),
      )

      const solid = modelRows.filter((r) => r.source !== "api" || mode === "api")
      const hollow = modelRows.filter((r) => r.source === "api" && mode !== "api")
      if (solid.length) {
        marks.push(
          dot(solid, {
            id: `dot-${modelId}`,
            x: "x",
            y: "score",
            r: 4.5,
            fill: color,
            fillOpacity: opacity,
            stroke: palette.surface,
            strokeWidth: 1.5,
            strokeOpacity: opacity,
            states,
          }),
        )
      }
      if (hollow.length) {
        marks.push(
          dot(hollow, {
            id: `api-dot-${modelId}`,
            x: "x",
            y: "score",
            r: 4,
            fill: palette.surface,
            fillOpacity: opacity,
            stroke: color,
            strokeWidth: 2,
            strokeOpacity: opacity,
            states,
          }),
        )
      }

      if (!labelled(modelId)) continue
      const best = modelRows.reduce((a, b) => (b.score > a.score ? b : a))
      marks.push(
        text([best], {
          id: `label-${modelId}`,
          x: "x",
          y: "score",
          text: (r) => r.model.short,
          dx: 8,
          dy: -8,
          anchor: "start",
          fontSize: 11.5,
          fontWeight: highlight === modelId ? 650 : 500,
          fill: palette.ink,
          states: [{ when: states[0].when, style: { opacity: 0.2 } }],
        }),
      )
    }

    return defineChart({
      marks,
      scales: {
        x: {
          scale: scaleLog().domain([xMin, hi]).clamp(true),
          grid: { stroke: palette.grid, opacity: 1 },
          axis: {
            label: mode === "api" ? "API cost per task (USD, log scale)" : "Cost per task (USD, log scale)",
            ticks: { values: tickValues, format: (v: number) => (hasFree && v === freeX ? "Free" : usd(v)) },
          },
        },
        y: {
          scale: scaleLinear().domain([0, yTop]),
          grid: { stroke: palette.grid, opacity: 1 },
          axis: { label: "FrontierCode 2.0 score", ticks: { format: (v: number) => `${v}%` } },
        },
      },
      margin: { right: compact ? 72 : 96 },
      theme: { foreground: palette.ink, muted: palette.inkMuted, grid: palette.grid },
      focus: "nearest",
      maxFocusDistance: 28,
      tooltip: { use: tooltip, motion: false },
      svgAnimation: true,
    })
  }, [rows, palette, mode, showApiGhost, showFrontier, highlight, compact])

  return (
    <Chart
      definition={definition}
      height={height}
      ariaLabel="FrontierCode 2.0 score against cost per task"
      ariaDescription="Each line is one model; points along it are reasoning-effort levels. Further left is cheaper, higher is better."
      onSelect={(point) => {
        const id = (point?.datum as Plotted | undefined)?.modelId ?? null
        onHighlight(id && id !== highlight ? id : null)
      }}
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
    <div className="min-w-56 space-y-2 text-xs">
      <div>
        <div className="text-sm font-semibold">{row.model.short}</div>
        <div className="text-muted-foreground">
          {EFFORT_LABEL[row.effort] ?? row.effort} effort · {row.model.harness}
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
        <dt className="text-muted-foreground">Score</dt>
        <dd className="text-right font-medium">{pct(row.score)}</dd>
        {mode === "subscription" && row.plan ? (
          <>
            <dt className="text-muted-foreground">On {row.plan.name}</dt>
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
      {mode === "subscription" && row.source === "api" ? (
        <div className="text-muted-foreground">No plan in range: shown at API price</div>
      ) : null}
      {row.offer?.unmetered && row.offer.promoUntil ? (
        <div className="text-muted-foreground">Unmetered promo until {row.offer.promoUntil}</div>
      ) : null}
    </div>
  )
}
