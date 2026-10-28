import { useMemo, useState, type CSSProperties } from "react"
import { defineChart, dot, lineY, link, type ChartBounds, type ChartFocusStrategy, type ChartMark, type ChartMarkStateContext, type ChartPoint } from "@tanstack/charts"
import { Chart } from "@tanstack/charts/react"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { scaleLog } from "d3-scale"
import { labGroup } from "@/lib/data"
import { cheaper, type CurrencyCode, EFFORT_LABEL, fee, money, moneyTick, scoreText, tokens, toCurrency } from "@/lib/format"
import { isLowConfidence, paretoFrontier, type Row } from "@/lib/pricing"
import type { ChartPalette } from "@/lib/theme"

/** A row with its plotted x position; unmetered (free) rows sit on a dedicated "Free" guide. */
type Plotted = Row & { x: number }

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
  /** Show the detail card for the hovered point. */
  showCard: boolean
  /** Fade every other model while a point is hovered. */
  dimOnHover: boolean
  /** Name each model beside its best point. */
  showLabels: boolean
  /** Fade models with no plan in range (every point API-priced) in subscription mode. */
  dimUnpriced: boolean
  /** Display currency; costs are converted before plotting, so the scene rebuilds when it changes. */
  currency: CurrencyCode
  /** Active benchmark's score name (hover card) and unit (y-axis ticks). */
  scoreLabel: string
  scoreUnit: string
}

/** Only effort points are hover targets; lines and guides share their positions. */
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

/** Opacity for models with no plan in range when the view dims them. */
const UNPRICED_OPACITY = 0.4

/** Models whose every point is an API-priced fallback (no plan in range), when dimming them. */
function unpricedModels(rows: readonly Row[], mode: "subscription" | "api", dim: boolean): Set<string> {
  if (!dim || mode !== "subscription") return new Set()
  const priced = new Set(rows.filter((r) => r.source !== "api").map((r) => r.modelId))
  return new Set(rows.filter((r) => !priced.has(r.modelId)).map((r) => r.modelId))
}

/** Decade ticks across [lo, hi] for a log axis. */
function decadeTicks(lo: number, hi: number): number[] {
  const out: number[] = []
  for (let v = 10 ** Math.ceil(Math.log10(lo)); v <= hi * 1.001; v *= 10) out.push(Number(v.toPrecision(3)))
  return out
}

export function CostScoreChart(props: Props) {
  const { rows, palette, mode, scale, showFrontier, highlight, height, compact, showCard, dimOnHover, showLabels, dimUnpriced, currency, scoreLabel, scoreUnit } = props

  const definition = useMemo(() => {
    const log = scale === "log"
    // Costs are plotted in the display currency so the axis gets round ticks in any currency.
    const positive = rows.map((r) => toCurrency(r.cost)).filter((v) => v > 0)
    const hasFree = log && rows.some((r) => r.cost === 0)
    const minPos = positive.length ? Math.min(...positive) : 0.01
    const maxCost = positive.length ? Math.max(...positive) : 1

    // Log axes start a touch under the cheapest point; free rows get their own guide further left.
    const lo = log ? minPos / 2 : 0
    const freeX = lo / 2.5
    const xMin = hasFree ? freeX : lo
    const xMax = log ? maxCost * 1.8 : maxCost * 1.06
    const tickValues = log ? [...(hasFree ? [freeX] : []), ...decadeTicks(lo, xMax)] : undefined

    const plotted: Plotted[] = rows.map((r) => ({ ...r, x: r.cost === 0 && log ? freeX : toCurrency(r.cost) }))
    const byModel = new Map<string, Plotted[]>()
    for (const r of plotted) byModel.set(r.modelId, [...(byModel.get(r.modelId) ?? []), r])

    const yTop = Math.max(10, Math.ceil((Math.max(0, ...rows.map((r) => r.score)) + 4) / 10) * 10)
    const color = (r: Row) => palette[labGroup(r.model)]

    // Hovering any point dims every other model; a sidebar highlight does the same persistently.
    const focusedOther = (modelId: string) => (ctx: ChartMarkStateContext<Plotted>) => (ctx.focus.primary.datum as Plotted).modelId !== modelId
    const unpriced = unpricedModels(rows, mode, dimUnpriced)
    const fade = (modelId: string) => (highlight && highlight !== modelId ? 0.15 : unpriced.has(modelId) ? UNPRICED_OPACITY : 1)

    const marks: ChartMark<Plotted, number, number>[] = []

    if (hasFree) {
      // Dashed vertical guide marking where unmetered ("Free") points sit.
      marks.push(
        link([plotted[0]], { id: "free-guide", x1: () => freeX, y1: () => 0, x2: () => freeX, y2: () => yTop, stroke: palette.inkMuted, strokeOpacity: 0.6, strokeWidth: 1, strokeDasharray: "3 4" }),
      )
    }

    if (showFrontier) {
      const frontier = paretoFrontier(plotted) as Plotted[]
      if (frontier.length > 1) {
        marks.push(lineY(frontier, { id: "frontier", x: "x", y: "score", stroke: palette.frontier, strokeOpacity: 0.4, strokeWidth: 1.25, strokeDasharray: "3 4" }))
      }
    }

    for (const [modelId, modelRows] of byModel) {
      const c = color(modelRows[0])
      const o = fade(modelId)
      const states = dimOnHover ? [{ when: focusedOther(modelId), style: { opacity: 0.3 } }] : []
      marks.push(
        lineY(modelRows, { id: `line-${modelId}`, x: "x", y: "score", stroke: c, strokeWidth: highlight === modelId ? 3 : 2, strokeOpacity: 0.85 * o, states }),
      )
      const solid = modelRows.filter((r) => r.source !== "api" || mode === "api")
      const hollow = modelRows.filter((r) => r.source === "api" && mode !== "api")
      if (solid.length) {
        marks.push(dot(solid, { id: `dot-${modelId}`, x: "x", y: "score", r: 4.5, fill: c, fillOpacity: o, stroke: palette.surface, strokeWidth: 1.5, strokeOpacity: o, states }))
      }
      if (hollow.length) {
        marks.push(dot(hollow, { id: `api-dot-${modelId}`, x: "x", y: "score", r: 4, fill: palette.surface, fillOpacity: o, stroke: c, strokeWidth: 2, strokeOpacity: o, states }))
      }
    }

    return defineChart({
      marks,
      scales: {
        x: {
          scale: log ? scaleLog().domain([xMin, xMax]).clamp(true) : scaleLinear().domain([0, xMax]),
          grid: { stroke: palette.grid, opacity: 1 },
          axis: {
            label: { text: `${mode === "api" ? "API cost" : "Subscription cost"} per task (${currency}, ${log ? "log" : "linear"})`, offset: 38, fontWeight: 500, fill: palette.inkMuted },
            line: false,
            ticks: {
              size: 0,
              padding: 10,
              ...(tickValues ? { values: tickValues } : {}),
              format: (v: number) => (hasFree && v === freeX ? "Free" : moneyTick(v)),
            },
          },
        },
        y: {
          scale: scaleLinear().domain([0, yTop]),
          grid: { stroke: palette.grid, opacity: 1 },
          axis: { line: false, ticks: { size: 0, padding: 10, format: (v: number) => `${v}${scoreUnit}` } },
        },
      },
      margin: { top: 28, right: compact ? 12 : 24 },
      theme: { foreground: palette.ink, muted: palette.inkMuted, grid: palette.grid },
      focus: nearestPoint,
      maxFocusDistance: 36,
      // The crosshair, enlarged point, labels and detail card are drawn by the overlay below.
      focusRing: false,
      tooltip: false,
      svgAnimation: true,
    })
  }, [rows, palette, mode, scale, showFrontier, highlight, compact, dimOnHover, dimUnpriced, currency, scoreUnit])

  // Focused point and the rendered dot positions (in scene pixels), for the overlays.
  const [focus, setFocus] = useState<ChartPoint<Plotted, number, number> | null>(null)
  const [scene, setScene] = useState<SceneInfo | null>(null)

  const labels = useMemo(() => (scene ? placeLabels(scene, rows, compact) : []), [scene, rows, compact])
  const active = (dimOnHover ? focus?.datum.modelId : null) ?? highlight

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
        onRender={({ scene: s }) => {
          const dots = s.points.filter(isDataPoint).map((p) => ({ key: (p.datum as Plotted).key, x: p.x, y: p.y }))
          const sig = `${s.width}x${s.height}:${s.chart.x},${s.chart.y},${s.chart.width},${s.chart.height}:${dots.map((d) => `${d.key}@${d.x.toFixed(1)},${d.y.toFixed(1)}`).join("|")}`
          setScene((prev) => (prev?.sig === sig ? prev : { sig, bounds: s.chart, width: s.width, height: s.height, dots }))
        }}
      />
      {scene ? <LowConfidenceRings scene={scene} rows={rows} active={active} /> : null}
      {scene && showLabels ? <LabelLayer labels={labels} active={active} faded={unpricedModels(rows, mode, dimUnpriced)} /> : null}
      {focus && scene ? <HoverOverlay point={focus} scene={scene} palette={palette} mode={mode} showCard={showCard} scoreLabel={scoreLabel} /> : null}
    </div>
  )
}

interface SceneInfo {
  sig: string
  bounds: ChartBounds
  width: number
  height: number
  dots: { key: string; x: number; y: number }[]
}

interface PlacedLabel {
  modelId: string
  text: string
  ax: number
  ay: number
  x: number
  y: number
  w: number
  h: number
  leader: boolean
}

const LABEL_FONT_PX = 12
const LABEL_H = 16

let measureCtx: CanvasRenderingContext2D | null = null
function textWidth(text: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d")
  if (!measureCtx) return text.length * 6.8
  measureCtx.font = `500 ${LABEL_FONT_PX}px ${getComputedStyle(document.body).fontFamily}`
  return measureCtx.measureText(text).width
}

type Rect = { x: number; y: number; w: number; h: number }
const overlaps = (a: Rect, b: Rect, pad = 2) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad

// Candidate directions around an anchor, in preference order: right, left, up, down, then diagonals.
const DIRECTIONS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
]
const RADII = [9, 22, 38, 58, 82, 110]

/**
 * Labels each model's best point beside it, greedily from the highest score down. Each
 * label tries eight directions at growing distances and takes the cheapest spot that
 * stays inside the plot, clears every placed label, and covers as few dots as possible.
 * Labels pushed away from their point get a leader line.
 */
function placeLabels(scene: SceneInfo, rows: readonly Row[], compact: boolean): PlacedLabel[] {
  const pos = new Map(scene.dots.map((d) => [d.key, d]))
  const best = new Map<string, Row>()
  for (const r of rows) {
    const cur = best.get(r.modelId)
    if (!cur || r.score > cur.score) best.set(r.modelId, r)
  }
  let anchors = [...best.values()].sort((a, b) => b.score - a.score)
  if (compact) anchors = anchors.slice(0, 6)

  const b = scene.bounds
  const placed: PlacedLabel[] = []
  const dotRects = scene.dots.map((d) => ({ x: d.x - 5, y: d.y - 5, w: 10, h: 10 }))

  for (const r of anchors) {
    const p = pos.get(r.key)
    if (!p) continue
    const effort = r.effort === "na" ? "" : ` ${EFFORT_LABEL[r.effort] ?? r.effort}`
    const text = `${r.model.short}${effort}`
    const w = textWidth(text) + 2
    const h = LABEL_H
    let choice: { rect: Rect; cost: number; radius: number } | null = null

    RADII.forEach((radius, ri) => {
      DIRECTIONS.forEach(([dx, dy], di) => {
        const k = dx && dy ? Math.SQRT1_2 : 1
        const cx = p.x + dx * radius * k
        const cy = p.y + dy * radius * k
        const rect = {
          x: dx > 0 ? cx : dx < 0 ? cx - w : cx - w / 2,
          y: dy > 0 ? cy : dy < 0 ? cy - h : cy - h / 2,
          w,
          h,
        }
        if (rect.x < b.x + 2 || rect.x + w > b.x + b.width - 2 || rect.y < b.y + 2 || rect.y + h > b.y + b.height - 2) return
        if (placed.some((l) => overlaps(rect, l))) return
        const covered = dotRects.filter((d) => overlaps(rect, d, 0)).length
        const cost = ri * 10 + di * 1.5 + covered * 25
        if (!choice || cost < choice.cost) choice = { rect, cost, radius }
      })
    })
    const chosen = choice as { rect: Rect; cost: number; radius: number } | null
    if (!chosen) continue
    placed.push({ modelId: r.modelId, text, ax: p.x, ay: p.y, ...chosen.rect, leader: chosen.radius > RADII[0] })
  }
  return placed
}

/** Dashed rings marking points whose plan price is a low-confidence allowance estimate. */
function LowConfidenceRings({ scene, rows, active }: { scene: SceneInfo; rows: readonly Row[]; active: string | null }) {
  const flagged = new Map(rows.filter(isLowConfidence).map((r) => [r.key, r.modelId]))
  if (!flagged.size) return null
  return (
    <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
      {scene.dots
        .filter((d) => flagged.has(d.key))
        .map((d) => (
          <circle
            key={d.key}
            cx={d.x}
            cy={d.y}
            r={8}
            fill="none"
            className="stroke-foreground/70"
            strokeWidth={1.25}
            strokeDasharray="2.5 2.5"
            opacity={active && active !== flagged.get(d.key) ? 0.25 : 1}
          />
        ))}
    </svg>
  )
}

function LabelLayer({ labels, active, faded }: { labels: PlacedLabel[]; active: string | null; faded: ReadonlySet<string> }) {
  const dim = (id: string) => (active && active !== id ? 0.25 : faded.has(id) && active !== id ? UNPRICED_OPACITY : 1)
  return (
    <div className="pointer-events-none absolute inset-0">
      <svg className="absolute inset-0 size-full overflow-visible">
        {labels
          .filter((l) => l.leader)
          .map((l) => {
            // Leader runs from the point to the nearest edge of its label.
            const tx = Math.min(Math.max(l.ax, l.x), l.x + l.w)
            const ty = Math.min(Math.max(l.ay, l.y), l.y + l.h)
            return <line key={l.modelId} x1={l.ax} y1={l.ay} x2={tx} y2={ty} className="stroke-muted-foreground" strokeWidth={1} opacity={0.6 * dim(l.modelId)} />
          })}
      </svg>
      {labels.map((l) => (
        <span
          key={l.modelId}
          className="chart-label absolute leading-4 font-medium whitespace-nowrap text-foreground transition-opacity"
          style={{ left: l.x, top: l.y, fontSize: LABEL_FONT_PX, opacity: dim(l.modelId) }}
        >
          {l.text}
        </span>
      ))}
    </div>
  )
}

const CARD_W = 256
const CARD_H = 272 // tallest card (subscription mode with a plan); used to keep it off the hovered point
const CARD_INSET = 12

function HoverOverlay({
  point,
  scene,
  palette,
  mode,
  showCard,
  scoreLabel,
}: {
  point: ChartPoint<Plotted, number, number>
  scene: SceneInfo
  palette: ChartPalette
  mode: "subscription" | "api"
  showCard: boolean
  scoreLabel: string
}) {
  const { bounds: b } = scene
  const r = point.datum
  const color = palette[labGroup(r.model)]
  const line = "pointer-events-none absolute border-dashed border-foreground/40"
  // Bottom-right by default; bottom-left when the card would sit on top of the hovered point.
  const cardLeft = point.x > b.x + b.width - CARD_W - CARD_INSET * 2 && point.y > b.y + b.height - CARD_H - CARD_INSET * 2
  const bottom = scene.height - (b.y + b.height) + CARD_INSET
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className={`${line} border-l`} style={{ left: point.x, top: b.y, height: b.height }} />
      <div className={`${line} border-t`} style={{ top: point.y, left: b.x, width: b.width }} />
      <span
        className={`absolute -translate-y-full pb-1 text-[11px] font-medium tabular-nums ${cardLeft ? "-translate-x-full" : ""}`}
        style={{ left: cardLeft ? b.x + b.width - 6 : b.x + 6, top: point.y }}
      >
        {scoreText(r.score)}
      </span>
      <span className="absolute pb-1 text-[11px] font-medium tabular-nums" style={{ left: point.x + 6, top: b.y + b.height - 20 }}>
        {money(r.cost)}
      </span>
      <span
        className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
        style={{ left: point.x, top: point.y, background: color, boxShadow: `0 0 0 1.5px ${color}` }}
      />
      {showCard ? (
        <DetailCard
          row={r}
          mode={mode}
          scoreLabel={scoreLabel}
          style={cardLeft ? { left: b.x + CARD_INSET, bottom } : { right: scene.width - (b.x + b.width) + CARD_INSET, bottom }}
        />
      ) : null}
    </div>
  )
}

function DetailCard({ row, mode, scoreLabel, style }: { row: Row; mode: "subscription" | "api"; scoreLabel: string; style: CSSProperties }) {
  const saving = row.source === "api" ? null : cheaper(row.apiCost, row.cost)
  const stat = (label: string, value: string, strong = false) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "text-right font-semibold" : "text-right"}>{value}</dd>
    </>
  )
  return (
    <div className="absolute w-64 rounded-xl border bg-popover/95 p-4 text-[12px] shadow-lg backdrop-blur" style={style}>
      <div className="text-[13px] font-semibold">{row.model.short}</div>
      <div className="mt-0.5 text-muted-foreground">
        {EFFORT_LABEL[row.effort] ?? row.effort} effort · {row.harness ?? `run by ${row.ranBy}`}
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 tabular-nums">
        {stat(scoreLabel, scoreText(row.score), true)}
        {mode === "subscription" && row.plan ? (
          <>
            {stat("Cost per task", money(row.cost), true)}
            {stat("Plan", row.plan.name)}
            {stat("Plan fee", `${fee(row.plan.fee)} / mo`)}
          </>
        ) : null}
        {stat(mode === "subscription" ? "API price per task" : "Cost per task", money(row.apiCost), mode === "api")}
        {saving ? stat("Saving vs API", saving) : null}
        {stat("Output tokens", tokens(row.outputTokens))}
      </dl>
      {mode === "subscription" && row.source === "api" ? <p className="mt-2.5 text-muted-foreground">No plan in range, so this is the API price.</p> : null}
      {isLowConfidence(row) ? <p className="mt-2.5 text-muted-foreground">≈ Plan allowance is a low-confidence estimate.</p> : null}
      {row.offer?.unmetered && row.offer.promoUntil ? <p className="mt-2.5 text-muted-foreground">Unmetered promo until {row.offer.promoUntil}.</p> : null}
    </div>
  )
}
