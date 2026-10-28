// Joins Cognition's FrontierCode 2.0 results with Real API Pricing subscription allowances
// into src/data/frontiercode.json. Run with `npm run data` after refreshing data-src/.
//
// Subscription $/task = API $/task × (plan $/Mtok ÷ model API $/Mtok).
// Both $/Mtok figures use the same Real API Pricing token mix, so the ratio is the
// fraction of list price a full-allowance subscriber actually pays.
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

const cognition = read("data-src/cognition-frontiercode-2.0.json");
const pricing = read("data-src/real-api-pricing-points.json");
const fx = read("data-src/fx.json");

// Token mixes from real-api-pricing/data/conventions.json.
const MIX = {
  standard: { cache: 0.97, input: 0.025, output: 0.005 },
  lowCache: { cache: 0.85, input: 0.145, output: 0.005 },
  // Anthropic bills uncached input as 5-minute cache writes (1.25× input).
  anthropic: { cache: 0.97, cacheWrite: 0.025, output: 0.005 },
};
const blend = ({ cached, input, output }, mix) =>
  mix.cache * cached + (mix.input ?? 0) * input + (mix.cacheWrite ?? 0) * input * 1.25 + mix.output * output;

const LABS = {
  Anthropic: { name: "Anthropic" },
  OpenAI: { name: "OpenAI" },
  Google: { name: "Google" },
  xAI: { name: "xAI" },
  Cognition: { name: "Cognition" },
  "Open weights": { name: "Open-weight labs" },
  Other: { name: "Other" },
};

// Cognition model name → pricing id, lab, and display name.
const MODELS = {
  "Claude Opus 5.5": { pricingId: "claude-opus-5.5", lab: "Anthropic", short: "Opus 5.5" },
  "Claude Sonnet 5.5": { pricingId: "claude-sonnet-5.5", lab: "Anthropic", short: "Sonnet 5.5" },
  "Claude Haiku 5.5": { pricingId: "claude-haiku-5.5", lab: "Anthropic", short: "Haiku 5.5" },
  "Claude Fable 5.1": { pricingId: "claude-fable-5.1", lab: "Anthropic", short: "Fable 5.1" },
  "Claude Opus 5": { pricingId: "claude-opus-5", lab: "Anthropic", short: "Opus 5", superseded: true },
  "Claude Opus 4.8": { pricingId: "claude-opus-4.8", lab: "Anthropic", short: "Opus 4.8", superseded: true },
  "GPT-6 Astra": { pricingId: "gpt-6-astra", lab: "OpenAI", short: "GPT-6 Astra" },
  "GPT-6.1 Sol": { pricingId: "gpt-6.1-sol", lab: "OpenAI", short: "GPT-6.1 Sol" },
  "GPT-6 Luna": { pricingId: "gpt-6-luna", lab: "OpenAI", short: "GPT-6 Luna" },
  "GPT-6 Sol": { pricingId: "gpt-6-sol", lab: "OpenAI", short: "GPT-6 Sol", superseded: true },
  "GPT-5.6 Sol": { pricingId: "gpt-5.6-sol", lab: "OpenAI", short: "GPT-5.6 Sol", superseded: true },
  "GPT-5.5": { pricingId: "gpt-5.5", lab: "OpenAI", short: "GPT-5.5", superseded: true },
  "Gemini 4 Argon": { pricingId: "gemini-4-argon", lab: "Google", short: "Gemini 4 Argon" },
  "Grok 4.7": { pricingId: "grok-4.7", lab: "xAI", short: "Grok 4.7" },
  "SWE-2": { pricingId: "swe-2", lab: "Cognition", short: "SWE-2" },
  "SWE-1.7": { pricingId: null, lab: "Cognition", short: "SWE-1.7", superseded: true },
  "SWE-1.6": { pricingId: null, lab: "Cognition", short: "SWE-1.6", superseded: true },
  "DeepSeek V4.1 Flash": { pricingId: "deepseek-v4.1-flash", lab: "Open weights", short: "DeepSeek V4.1 Flash", openWeights: true },
  "Kimi K3": { pricingId: "kimi-k3", lab: "Open weights", short: "Kimi K3", openWeights: true },
  "GLM 5.3": { pricingId: "glm-5.3", lab: "Open weights", short: "GLM 5.3", openWeights: true },
  "GLM 5.3 Flash": { pricingId: "glm-5.3-flash", lab: "Open weights", short: "GLM 5.3 Flash", openWeights: true },
  "Mistral Large 4": { pricingId: null, lab: "Other", short: "Mistral Large 4" },
  "Muse Wonder 1.0": { pricingId: null, lab: "Other", short: "Muse Wonder 1.0" },
  // Inkling Small has one third-party allowance but no published API price to normalise it against.
  "Inkling Small": { pricingId: null, lab: "Other", short: "Inkling Small" },
  "Beam 1.0": { pricingId: null, lab: "Other", short: "Beam 1.0" },
};
// Cognition hides Obsidian 3 on its own leaderboard; follow that.
const HIDDEN = new Set(["Obsidian 3"]);

// API $/Mtok for models with no metered row or list price in Real API Pricing.
// GPT-6 Sol/6.1 Sol/Astra: implied by mypriors.com's published ChatGPT Plus $/task
// (plan $/Mtok × Cognition API $/task ÷ mypriors subscription $/task, median across efforts).
// GPT-6 Luna: Factory Droid multiplier ratio to GPT-6 Sol (0.04× vs 0.8×).
// Gemini 4 Argon: launch list price $0.10/$2/$10 on the low-cache mix (adopted.csv note).
const API_FALLBACK = {
  "gpt-6-astra": { usdPerMtok: 1.464, basis: "implied", note: "Implied from mypriors ChatGPT Plus $/task (≈ $1 / $10 / $50 list)" },
  "gpt-6-sol": { usdPerMtok: 0.29, basis: "implied", note: "Implied from mypriors ChatGPT Plus $/task (≈ $0.20 / $2 / $10 list)" },
  "gpt-6.1-sol": { usdPerMtok: 0.197, basis: "implied", note: "Implied from mypriors ChatGPT Plus $/task" },
  "gpt-6-luna": { usdPerMtok: 0.0145, basis: "estimated", note: "GPT-6 Sol × Factory Droid multiplier ratio (0.04 / 0.8)" },
  "gemini-4-argon": {
    usdPerMtok: blend({ cached: 0.1, input: 2, output: 10 }, MIX.lowCache),
    basis: "list",
    note: "Launch list price $0.10 / $2 / $10, low-cache mix",
  },
};

const points = pricing.points;

function apiPrice(pricingId) {
  if (!pricingId) return null;
  const metered = points.filter((p) => p.billing === "metered" && p.model === pricingId);
  // DeepSeek has peak/off-peak API rows; list (peak) price is the honest comparison.
  const listRow = metered.find((p) => !/offpeak/.test(p.id)) ?? metered[0];
  if (listRow) return { usdPerMtok: listRow.real_usd_per_mtok, basis: "metered", note: `${listRow.plan} metered API` };
  if (API_FALLBACK[pricingId]) return API_FALLBACK[pricingId];
  const withList = points.find((p) => p.model === pricingId && p.list_price);
  if (withList) {
    const mix = withList.vendor === "Anthropic" ? MIX.anthropic : withList.vendor === "Google" ? MIX.lowCache : MIX.standard;
    return { usdPerMtok: blend(withList.list_price, mix), basis: "list", note: "Official list price on the standard mix" };
  }
  return null;
}

// Plan metadata keyed by Real API Pricing plan id. GLM plans come in peak / mid / off-peak
// scenarios. Only prices a new customer can buy today are kept: GLM's existing-customer
// rates and Kimi's v1 plans (replaced on 2026-10-26) are skipped.
const LEGACY_PLANS = new Set(["kimi_moderato_cn", "kimi_allegretto_cn", "kimi_allegro_cn"]);
const isLegacyPlan = (planId) => LEGACY_PLANS.has(planId) || /^glm_coding_\w+_cn_old_/.test(planId);

const PLAN_META = {
  claude_pro: { name: "Claude Pro", provider: "Anthropic", kind: "lab" },
  claude_max_5x: { name: "Claude Max 5x", provider: "Anthropic", kind: "lab" },
  claude_team: { name: "Claude Team Premium", provider: "Anthropic", kind: "lab" },
  claude_max_20x: { name: "Claude Max 20x", provider: "Anthropic", kind: "lab" },
  chatgpt_plus: { name: "ChatGPT Plus", provider: "OpenAI", kind: "lab" },
  chatgpt_pro_5x: { name: "ChatGPT Pro 5x", provider: "OpenAI", kind: "lab" },
  chatgpt_pro_20x: { name: "ChatGPT Pro 20x", provider: "OpenAI", kind: "lab" },
  google_ai_pro_us: { name: "Google AI Pro", provider: "Google", kind: "lab" },
  supergrok: { name: "SuperGrok", provider: "xAI", kind: "lab" },
  supergrok_plus: { name: "SuperGrok Plus", provider: "xAI", kind: "lab" },
  supergrok_heavy: { name: "SuperGrok Heavy", provider: "xAI", kind: "lab" },
  devin_pro: { name: "Devin Pro", provider: "Cognition", kind: "lab" },
  devin_max: { name: "Devin Max", provider: "Cognition", kind: "tool" },
  kimi_plus_cn: { name: "Kimi Plus", provider: "Moonshot", kind: "lab" },
  kimi_pro_cn: { name: "Kimi Pro", provider: "Moonshot", kind: "lab" },
  kimi_max_cn: { name: "Kimi Max", provider: "Moonshot", kind: "lab" },
  kimi_ultra_cn: { name: "Kimi Ultra", provider: "Moonshot", kind: "lab" },
  cursor_ultra: { name: "Cursor Ultra", provider: "Cursor", kind: "tool" },
  droid_pro: { name: "Factory Droid Pro", provider: "Factory", kind: "tool" },
  droid_max: { name: "Factory Droid Max", provider: "Factory", kind: "tool" },
  opencode_go: { name: "OpenCode Go", provider: "OpenCode", kind: "tool" },
  command_code_goat: { name: "Command Code GOAT", provider: "Command Code", kind: "tool" },
  ollama_pro: { name: "Ollama Pro", provider: "Ollama", kind: "tool" },
  ollama_max: { name: "Ollama Max", provider: "Ollama", kind: "tool" },
};
const GLM_TIER = { lite: "Lite", pro: "Pro", max: "Max" };
const GLM_SCENARIO = { peak: "peak", mid: "mid", offpeak: "offpeak" };

function planMeta(planId) {
  const glm = planId.match(/^glm_coding_(lite|pro|max)_cn_new_(peak|mid|offpeak)$/);
  if (glm) {
    const [, tier, scenario] = glm;
    return {
      name: `GLM Coding ${GLM_TIER[tier]}`,
      provider: "Zhipu",
      kind: "lab",
      scenario: GLM_SCENARIO[scenario],
      group: `glm_coding_${tier}_cn`,
    };
  }
  return PLAN_META[planId] ?? null;
}

const models = [];
for (const name of cognition.models) {
  if (HIDDEN.has(name)) continue;
  const meta = MODELS[name];
  if (!meta) throw new Error(`No mapping for Cognition model ${name}`);
  const efforts = cognition.efforts[name]
    .map((effort) => {
      const r = cognition.data[name]?.[effort]?.main;
      if (r?.new_score == null || r.cost == null) return null;
      return {
        effort,
        score: +(r.new_score * 100).toFixed(2),
        passRate: r.correct == null ? null : +(r.correct * 100).toFixed(2),
        flaggedRate: r.flagged_rate == null ? null : +(r.flagged_rate * 100).toFixed(2),
        apiCost: r.cost,
        outputTokens: r.tokens ?? null,
      };
    })
    .filter(Boolean);
  models.push({
    id: name.toLowerCase().replace(/[^a-z0-9.]+/g, "-"),
    name,
    short: meta.short,
    lab: meta.lab,
    harness: cognition.harness[name] ?? null,
    pricingId: meta.pricingId,
    superseded: !!meta.superseded,
    openWeights: !!meta.openWeights,
    api: apiPrice(meta.pricingId),
    efforts,
  });
}

const modelByPricingId = new Map(models.filter((m) => m.pricingId).map((m) => [m.pricingId, m]));
const plans = new Map();
for (const p of points) {
  if (p.billing !== "subscription") continue;
  const model = modelByPricingId.get(p.model);
  // Metered allowances need an API $/Mtok to normalise against; unmetered ones cost $0 regardless.
  if (!model || (!model.api && !p.unmetered)) continue;
  const planId = p.id.split("::")[0];
  if (isLegacyPlan(planId)) continue;
  const meta = planMeta(planId);
  if (!meta) throw new Error(`No plan metadata for ${planId}`);
  if (!plans.has(planId)) {
    plans.set(planId, {
      id: planId,
      ...meta,
      scenario: meta.scenario ?? null,
      group: meta.group ?? planId,
      fee: p.price_usd,
      localPrice: p.local_price,
      offers: [],
    });
  }
  plans.get(planId).offers.push({
    modelId: model.id,
    usdPerMtok: p.real_usd_per_mtok,
    unmetered: !!p.unmetered,
    promoUntil: p.promo_until,
    confidence: p.confidence,
    dataDate: p.data_date,
    source: p.source,
  });
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  sources: {
    benchmark: { name: "Cognition FrontierCode 2.0 (main subset, 132 tasks)", url: "https://cognition.com/frontiercode" },
    pricing: { name: "Real API Pricing", url: "https://github.com/Fei2411/real-api-pricing", snapshot: pricing.generatedAt },
    reference: { name: "mypriors FrontierCode 2.0", url: "https://mypriors.com/benchmarks/frontiercode-2.0-main" },
  },
  labs: LABS,
  // USD → currency multipliers for the currency select; every price in the data stays in USD.
  fx: { date: fx.date, source: "ECB reference rates via Frankfurter", rates: { USD: 1, ...fx.rates } },
  models,
  plans: [...plans.values()].sort((a, b) => a.fee - b.fee || a.name.localeCompare(b.name)),
};
writeFileSync(new URL("src/data/frontiercode.json", root), JSON.stringify(out, null, 1) + "\n");
console.log(`${models.length} models, ${out.plans.length} plans, ${out.plans.reduce((n, p) => n + p.offers.length, 0)} plan×model offers`);
for (const m of models) console.log(m.short.padEnd(22), m.api ? `${m.api.usdPerMtok.toFixed(4)} ${m.api.basis}` : "no API $/Mtok");
