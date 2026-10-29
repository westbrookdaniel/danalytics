// Fetches Artificial Analysis results for the models danalytics charts and writes
// data-src/artificial-analysis.json. Each effort level has its own model page whose
// server-rendered payload carries that configuration's record (Intelligence Index score,
// cost per task, FrontierCode 2.0 score and eval token counts). Pages are fetched one at a
// time with a pause; robots.txt allows it. Follow with `npm run data`.
import { writeFileSync } from "node:fs"

const root = new URL("..", import.meta.url)
const BASE = "https://artificialanalysis.ai"
const PAUSE_MS = 1200

// Our model id → Artificial Analysis family slug. Effort variants are `<family>-<effort>`.
const FAMILIES = {
  "claude-opus-5.5": "claude-opus-5-5",
  "claude-sonnet-5.5": "claude-sonnet-5-5",
  "claude-haiku-5.5": "claude-haiku-5-5",
  "claude-fable-5.1": "claude-fable-5-1",
  "claude-opus-5": "claude-opus-5",
  "claude-opus-4.8": "claude-opus-4-8",
  "gpt-6-astra": "gpt-6-astra",
  "gpt-6.1-sol": "gpt-6-1-sol",
  "gpt-6.1-terra": "gpt-6-1-terra",
  "gpt-6-luna": "gpt-6-luna",
  "gpt-6-sol": "gpt-6-sol",
  "gpt-5.6-sol": "gpt-5-6-sol",
  "gpt-5.5": "gpt-5-5",
  "gemini-4-carbon": "gemini-4-carbon",
  "gemini-4-argon": "gemini-4-argon",
  "grok-4.7": "grok-4-7",
  "deepseek-v4.1-flash": "deepseek-v4-1-flash",
  "deepseek-v4.1-flash-1017": "deepseek-v4-1-flash-1017",
  "kimi-k3.1-pro": "kimi-k3-1-pro",
  "kimi-k3": "kimi-k3",
  "glm-5.3": "glm-5-3",
  "glm-5.3-flash": "glm-5-3-flash",
  "muse-wonder-1.0": "muse-wonder",
}
const EFFORT_SUFFIXES = ["low", "medium", "high", "xhigh", "non-reasoning"]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getText(url) {
  const res = await fetch(url, { headers: { "user-agent": "danalytics data refresh (personal project)" } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.text()
}

/** Next.js RSC payload pushed into the page as JSON strings. */
function rscPayload(html) {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,(".*?")\]\)<\/script>/gs)].map((m) => JSON.parse(m[1])).join("")
}

/** The model record for `slug` inside a payload. */
function findRecord(payload, slug) {
  const marker = `"slug":"${slug}"`
  for (let i = payload.indexOf(marker); i >= 0; i = payload.indexOf(marker, i + 1)) {
    const start = payload.lastIndexOf('{"id":"', i)
    if (start < 0) continue
    // Walk to the matching brace; strings may contain braces, so track quoting.
    let depth = 0
    let inStr = false
    for (let j = start; j < payload.length; j++) {
      const c = payload[j]
      if (inStr) {
        if (c === "\\") j++
        else if (c === '"') inStr = false
      } else if (c === '"') inStr = true
      else if (c === "{") depth++
      else if (c === "}" && --depth === 0) {
        const rec = JSON.parse(payload.slice(start, j + 1))
        if (rec.slug === slug && "intelligenceIndex" in rec) return rec
        break
      }
    }
  }
  return null
}

const sitemap = await getText(`${BASE}/sitemap.xml`)
const allSlugs = new Set([...sitemap.matchAll(/artificialanalysis\.ai\/models\/([a-z0-9-]+)</g)].map((m) => m[1]))

const out = { fetchedAt: new Date().toISOString().slice(0, 10), source: `${BASE}/models`, models: {} }
for (const [modelId, family] of Object.entries(FAMILIES)) {
  const variants = [family, ...EFFORT_SUFFIXES.map((e) => `${family}-${e}`)].filter((s) => allSlugs.has(s))
  out.models[modelId] = []
  for (const slug of variants) {
    await sleep(PAUSE_MS)
    const rec = findRecord(rscPayload(await getText(`${BASE}/models/${slug}`)), slug)
    if (!rec) {
      console.warn(`  no record for ${slug}`)
      continue
    }
    out.models[modelId].push({
      slug,
      name: rec.name,
      suffix: rec.suffix ?? null,
      intelligenceIndex: rec.intelligenceIndex,
      intelligenceIndexIsEstimated: !!rec.intelligenceIndexIsEstimated,
      intelligenceIndexCostPerTask: rec.intelligenceIndexCostPerTask?.cost?.total ?? null,
      intelligenceIndexEvalCosts: rec.intelligenceIndexCostPerTask?.evaluations ?? null,
      intelligenceIndexOutputTokensPerTask: rec.intelligenceIndexOutputTokensPerTask ?? null,
      frontierCode20: rec.frontierCode20 ?? null,
      frontierCode20Tokens: rec.canonicalEvalTokenCounts?.frontierCode20 ?? null,
      prices: {
        input: rec.price1mInputTokens,
        output: rec.price1mOutputTokens,
        cacheHit: rec.cacheHitPrice,
        cacheWrite: rec.cacheWritePrice,
      },
    })
    console.log(`  ${slug}: II ${rec.intelligenceIndex?.toFixed?.(1)} · $${rec.intelligenceIndexCostPerTask?.cost?.total?.toFixed?.(3)}/task · FC2 ${rec.frontierCode20 ?? "—"}`)
  }
}

writeFileSync(new URL("data-src/artificial-analysis.json", root), JSON.stringify(out, null, 1) + "\n")
console.log(`Artificial Analysis: ${Object.values(out.models).flat().length} configurations for ${Object.keys(out.models).length} models`)
