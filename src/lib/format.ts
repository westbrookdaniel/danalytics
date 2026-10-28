/** Dollar amount with precision that scales down for sub-cent values. */
export function usd(value: number): string {
  if (value === 0) return "Free"
  if (!Number.isFinite(value)) return "—"
  if (value >= 100) return `$${value.toFixed(0)}`
  if (value >= 10) return `$${value.toFixed(1)}`
  if (value >= 1) return `$${value.toFixed(2)}`
  if (value >= 0.1) return `$${value.toFixed(2)}`
  if (value >= 0.01) return `$${value.toFixed(3)}`
  // Number() drops the trailing zero toPrecision leaves on round values (0.00010 → 0.0001).
  return `$${Number(value.toPrecision(2))}`
}

/** Short axis tick for round dollar values: $0.001, $0.01, $0.1, $1, $10. */
export const usdTick = (value: number) => `$${Number(value.toPrecision(2))}`

export const pct =(value: number) => `${value.toFixed(1)}%`

export const fee = (value: number) => (Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`)

export function tokens(value: number | null): string {
  if (value == null) return "—"
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k` : `${value}`
}

/** "66×" style multiple of how much cheaper a subscription task is than list price. */
export function cheaper(api: number, sub: number): string | null {
  if (sub <= 0) return "∞×"
  const x = api / sub
  if (x < 1.05) return null
  return x >= 10 ? `${Math.round(x)}×` : `${x.toFixed(1)}×`
}

export const EFFORT_LABEL: Record<string, string> = {
  none: "no reasoning",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
  na: "default",
}
