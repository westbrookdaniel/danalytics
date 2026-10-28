// Refreshes data-src/ from the upstream sources. Follow with `npm run data`.
import { writeFileSync } from "node:fs"

const root = new URL("..", import.meta.url)

const COGNITION = "https://cognition.com/data/frontier-code-2.0/data.json"
const PRICING = "https://raw.githubusercontent.com/Fei2411/real-api-pricing/main/derived/points.json"
// ECB reference rates via Frankfurter (no key). Keep in sync with CURRENCIES in src/lib/format.ts.
const FX = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=AUD,EUR,GBP,CAD,NZD,JPY,CNY,INR"

async function getJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "frontiercode-costs data refresh" } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.json()
}

const cognition = await getJson(COGNITION)
writeFileSync(new URL("data-src/cognition-frontiercode-2.0.json", root), JSON.stringify(cognition))

// points.json repeats every leaderboard's score columns per row ("board__field"); only pricing is needed.
const pricing = await getJson(PRICING)
const points = pricing.points.map((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !k.includes("__"))))
writeFileSync(
  new URL("data-src/real-api-pricing-points.json", root),
  JSON.stringify({ generatedAt: pricing.generatedAt, mix: pricing.mix, points }, null, 1),
)

const fx = await getJson(FX)
writeFileSync(new URL("data-src/fx.json", root), JSON.stringify(fx))

console.log(
  `Cognition: ${cognition.models.length} models · Real API Pricing: ${points.length} points (snapshot ${pricing.generatedAt}) · FX ${fx.date}`,
)
