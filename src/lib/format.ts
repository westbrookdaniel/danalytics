import { data } from "@/lib/data"

export const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US dollar" },
  { code: "AUD", symbol: "A$", name: "Australian dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British pound" },
  { code: "CAD", symbol: "C$", name: "Canadian dollar" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand dollar" },
  { code: "JPY", symbol: "¥", name: "Japanese yen" },
  { code: "CNY", symbol: "CN¥", name: "Chinese yuan" },
  { code: "INR", symbol: "₹", name: "Indian rupee" },
] as const
export type CurrencyCode = (typeof CURRENCIES)[number]["code"]

/**
 * Display currency. All data stays in USD; formatting converts at the edge. App sets this
 * from its state at the top of every render, so components can format without threading
 * the currency through props.
 */
let current = { code: "USD" as CurrencyCode, symbol: "$", rate: 1 }

export function setCurrency(code: CurrencyCode) {
  const c = CURRENCIES.find((x) => x.code === code) ?? CURRENCIES[0]
  current = { code: c.code, symbol: c.symbol, rate: data.fx.rates[c.code] ?? 1 }
}

export const currencyCode = () => current.code
export const currencySymbol = () => current.symbol

/** USD → display currency, for values that are plotted rather than printed. */
export const toCurrency = (usdValue: number) => usdValue * current.rate

/** Amount already in the display currency, with precision that scales down for small values. */
function formatAmount(value: number): string {
  const s = current.symbol
  if (value === 0) return "Free"
  if (!Number.isFinite(value)) return "—"
  if (value >= 100) return `${s}${Math.round(value).toLocaleString()}`
  if (value >= 10) return `${s}${value.toFixed(1)}`
  if (value >= 0.1) return `${s}${value.toFixed(2)}`
  if (value >= 0.01) return `${s}${value.toFixed(3)}`
  // Number() drops the trailing zero toPrecision leaves on round values (0.00010 → 0.0001).
  return `${s}${Number(value.toPrecision(2))}`
}

/** A USD amount shown in the display currency. */
export const money = (usdValue: number) => formatAmount(toCurrency(usdValue))

/** Axis tick for a value already in the display currency: $0.001, $0.01, $0.1, $1. */
export const moneyTick = (value: number) => `${current.symbol}${Number(value.toPrecision(2)).toLocaleString()}`

/** Monthly fee in the display currency: whole units when round, cents otherwise. */
export function fee(usdValue: number): string {
  const v = toCurrency(usdValue)
  if (current.code === "JPY" || current.code === "INR" || v >= 1000) return `${current.symbol}${Math.round(v).toLocaleString()}`
  return Number.isInteger(v) ? `${current.symbol}${v}` : `${current.symbol}${v.toFixed(2)}`
}

/** Rounded fee for labels like brackets and the budget slider. */
export const feeShort = (usdValue: number) => `${current.symbol}${Math.round(toCurrency(usdValue)).toLocaleString()}`

/** Fee-bracket label in the display currency, e.g. "≤ $20", "$21–60", "$250+". */
export function bracketLabel(b: { min: number; max: number }): string {
  const n = (usdValue: number) => Math.round(toCurrency(usdValue)).toLocaleString()
  if (b.min === 0) return `≤ ${current.symbol}${n(b.max)}`
  if (!Number.isFinite(b.max)) return `${current.symbol}${n(Math.floor(b.min))}+`
  return `${current.symbol}${n(Math.ceil(b.min))}–${n(b.max)}`
}

export const pct = (value: number) => `${value.toFixed(1)}%`

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
