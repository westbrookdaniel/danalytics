// Joins benchmark results (Artificial Analysis Intelligence Index v5, Cognition FrontierCode 2.0)
// with Real API Pricing subscription allowances into src/data/frontiercode.json.
// Run with `npm run data` after refreshing data-src/.
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
const aa = read("data-src/artificial-analysis.json");
const resetHistory = read("data-src/resetbeacon-history.json");

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
  // Released 2026-10-28; no plan allowance measured yet, so it charts at API price.
  "Gemini 4 Carbon": { pricingId: "gemini-4-carbon", lab: "Google", short: "Gemini 4 Carbon" },
  "Grok 4.7": { pricingId: "grok-4.7", lab: "xAI", short: "Grok 4.7" },
  "SWE-1.7": { pricingId: null, lab: "Cognition", short: "SWE-1.7", superseded: true },
  "SWE-1.6": { pricingId: null, lab: "Cognition", short: "SWE-1.6", superseded: true },
  "DeepSeek V4.1 Flash": { pricingId: "deepseek-v4.1-flash", lab: "Open weights", short: "DeepSeek V4.1 Flash", openWeights: true },
  "Kimi K3": { pricingId: "kimi-k3", lab: "Open weights", short: "Kimi K3", openWeights: true },
  "GLM 5.3": { pricingId: "glm-5.3", lab: "Open weights", short: "GLM 5.3", openWeights: true },
  "GLM 5.3 Flash": { pricingId: "glm-5.3-flash", lab: "Open weights", short: "GLM 5.3 Flash", openWeights: true },
  "Muse Wonder 1.0": { pricingId: null, lab: "Other", short: "Muse Wonder 1.0" },
};
// Left out: Obsidian 3 (Cognition hides it too), plus SWE-2, Mistral Large 4, Inkling Small
// and Beam 1.0, which are niche or near-zero on these benchmarks.
const HIDDEN = new Set(["Obsidian 3", "SWE-2", "Mistral Large 4", "Inkling Small", "Beam 1.0"]);

// API $/Mtok for models with no metered row or list price in Real API Pricing.
// Gemini 4 Argon: introductory price $0.10/$2/$10 on the low-cache mix (adopted.csv note), which its plan
// allowance and Cognition's costs use. Everything else falls back to Artificial Analysis's list price below.
const API_FALLBACK = {
  "gemini-4-argon": {
    usdPerMtok: blend({ cached: 0.1, input: 2, output: 10 }, MIX.lowCache),
    basis: "list",
    note: "Launch list price $0.10 / $2 / $10, low-cache mix",
  },
};

const points = pricing.points;
const mixFor = (lab) => (lab === "Anthropic" ? MIX.anthropic : lab === "Google" ? MIX.lowCache : MIX.standard);

function apiPrice(pricingId, lab) {
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
  // Artificial Analysis lists the provider's price for each model it runs (e.g. the GPT-6 family, which Real API
  // Pricing only covers through plans).
  const aaPrice = aa.models[pricingId]?.find((c) => c.prices?.input != null)?.prices;
  if (aaPrice) {
    const { cacheHit, input, output } = aaPrice;
    return {
      usdPerMtok: blend({ cached: cacheHit ?? input, input, output }, mixFor(lab)),
      basis: "list",
      note: `List price $${cacheHit ?? input} / $${input} / $${output} via Artificial Analysis`,
    };
  }
  return null;
}

// Plan metadata keyed by Real API Pricing plan id. GLM plans come in peak / mid / off-peak
// scenarios. Only prices a new customer can buy today are kept: GLM's existing-customer
// rates and Kimi's v1 plans (replaced on 2026-10-26) are skipped.
const LEGACY_PLANS = new Set(["kimi_moderato_cn", "kimi_allegretto_cn", "kimi_allegro_cn"]);
const isLegacyPlan = (planId) => LEGACY_PLANS.has(planId) || /^glm_coding_\w+_cn_old_/.test(planId);
// Resellers left out of the comparison: Factory Droid, Ollama, Devin and Command Code.
const isExcludedPlan = (planId) => /^(droid_|ollama_|devin_|command_code_)/.test(planId);

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

const modelId = (name) => name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");

// Models Cognition hasn't run yet; their results come only from Artificial Analysis.
const EXTRA_MODELS = {
  "GPT-6.1 Terra": { pricingId: "gpt-6.1-terra", lab: "OpenAI", short: "GPT-6.1 Terra" },
  // Proprietary, unlike Kimi K3. Real API Pricing's Kimi plan rows are adopted as kimi-k3 only (the K3.1 Pro
  // sample that re-based them is research-only), so this charts at API price.
  "Kimi K3.1 Pro": { pricingId: "kimi-k3.1-pro", lab: "Other", short: "Kimi K3.1 Pro" },
  // DeepSeek's 2026-10-17 snapshot. Real API Pricing only measures the original V4.1 Flash, so
  // this has no plan allowances of its own and charts at API price.
  "DeepSeek V4.1 Flash 1017": { pricingId: "deepseek-v4.1-flash-1017", lab: "Open weights", short: "DeepSeek V4.1 Flash 1017", openWeights: true },
};

const models = [];
for (const name of [...cognition.models.filter((n) => !HIDDEN.has(n)), ...Object.keys(EXTRA_MODELS)]) {
  const meta = MODELS[name] ?? EXTRA_MODELS[name];
  if (!meta) throw new Error(`No mapping for Cognition model ${name}`);
  models.push({
    id: modelId(name),
    name,
    short: meta.short,
    lab: meta.lab,
    pricingId: meta.pricingId,
    superseded: !!meta.superseded,
    openWeights: !!meta.openWeights,
    api: apiPrice(meta.pricingId, meta.lab),
  });
}
const modelIds = new Set(models.map((m) => m.id));

// --- Benchmark results: { modelId: EffortResult[] } per benchmark -------------------------

/** Effort level of an Artificial Analysis configuration, from its slug suffix or display suffix. */
function aaEffort(config) {
  if (config.slug.endsWith("-non-reasoning")) return "none";
  const tail = config.slug.match(/-(low|medium|high|xhigh)$/)?.[1];
  if (tail) return tail;
  // Base pages are the model's top setting; their suffix says which (e.g. "Max, Default Fallback").
  const word = (config.suffix ?? "").split(",")[0].trim().toLowerCase();
  return ["low", "medium", "high", "xhigh", "max"].includes(word) ? word : "na";
}

// Artificial Analysis reports each evaluation's cost per task weighted by its share of the
// Intelligence Index. FrontierCode 2.0 carries 1/6: weighted cost × 6 matches the cost from
// its token totals ÷ 132 tasks within 3% for the five max-effort models that publish both
// (and those agree with Cognition's own $/task to within a few percent).
const FC2_INDEX_WEIGHT = 1 / 6;

/** API $/task for an Artificial Analysis FrontierCode 2.0 run, from the index cost breakdown. */
function aaFrontierCodeCost(config) {
  const fc = config.intelligenceIndexEvalCosts?.find((e) => e.slug === "frontiercode-2-0");
  return fc ? fc.weightedCostPerTask / FC2_INDEX_WEIGHT : null;
}

const frontierCode = {};
for (const name of cognition.models) {
  if (HIDDEN.has(name)) continue;
  frontierCode[modelId(name)] = cognition.efforts[name]
    .map((effort) => {
      const r = cognition.data[name]?.[effort]?.main;
      if (r?.new_score == null || r.cost == null) return null;
      return {
        effort,
        score: +(r.new_score * 100).toFixed(2),
        apiCost: r.cost,
        outputTokens: r.tokens ?? null,
        harness: cognition.harness[name] ?? null,
        source: "Cognition",
      };
    })
    .filter(Boolean);
}

const intelligence = {};
for (const [id, configs] of Object.entries(aa.models)) {
  if (!modelIds.has(id)) continue;
  const ii = configs
    .filter((c) => c.intelligenceIndex != null && c.intelligenceIndexCostPerTask != null)
    .map((c) => ({
      effort: aaEffort(c),
      score: +c.intelligenceIndex.toFixed(2),
      apiCost: c.intelligenceIndexCostPerTask,
      outputTokens: c.intelligenceIndexOutputTokensPerTask?.output != null ? Math.round(c.intelligenceIndexOutputTokensPerTask.output) : null,
      harness: null,
      source: "Artificial Analysis",
      estimated: c.intelligenceIndexIsEstimated,
    }));
  if (ii.length) intelligence[id] = ii;

  // Cognition's own runs are the FrontierCode source of record; only models it hasn't
  // published yet borrow Artificial Analysis's run.
  if (!frontierCode[id]) {
    const fc = configs
      .map((c) => ({ c, cost: aaFrontierCodeCost(c) }))
      .filter(({ c, cost }) => c.frontierCode20 != null && cost != null)
      .map(({ c, cost }) => ({
        effort: aaEffort(c),
        score: +(c.frontierCode20 * 100).toFixed(2),
        apiCost: cost,
        outputTokens: null,
        harness: "Artificial Analysis",
        source: "Artificial Analysis",
      }));
    if (fc.length) frontierCode[id] = fc;
  }
}

// Gemini 4 Argon's $0.10 / $2 / $10 is an introductory price (to 2026-11-30). Cognition's costs and the plan
// allowances use it, but Artificial Analysis prices Argon at the $0.20 / $4 / $20 list price that follows, so
// its Intelligence Index costs need the matching $/Mtok to keep the subscription ratio on the same basis.
const argonAA = aa.models["gemini-4-argon"]?.[0]?.prices;
const intelligenceApiPrices = argonAA
  ? {
      "gemini-4-argon": {
        usdPerMtok: blend({ cached: argonAA.cacheHit, input: argonAA.input, output: argonAA.output }, MIX.lowCache),
        basis: "list",
        note: `Artificial Analysis list price $${argonAA.cacheHit} / $${argonAA.input} / $${argonAA.output}, low-cache mix`,
      },
    }
  : {};

const benchmarks = [
  {
    id: "aa-intelligence-v5",
    name: "Intelligence Index v5",
    detail: "Artificial Analysis · 9 evaluations",
    scoreLabel: "Intelligence Index",
    scoreUnit: "",
    source: { name: "Artificial Analysis Intelligence Index v5", url: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index", fetched: aa.fetchedAt },
    results: intelligence,
    apiPrices: intelligenceApiPrices,
  },
  {
    id: "frontiercode-2.0",
    name: "FrontierCode 2.0",
    detail: "Cognition · main subset · 132 tasks",
    scoreLabel: "FrontierCode score",
    scoreUnit: "%",
    source: { name: "Cognition FrontierCode 2.0 (main subset, 132 tasks)", url: "https://cognition.com/frontiercode" },
    results: frontierCode,
  },
];

const modelByPricingId = new Map(models.filter((m) => m.pricingId).map((m) => [m.pricingId, m]));
const plans = new Map();
for (const p of points) {
  if (p.billing !== "subscription") continue;
  const model = modelByPricingId.get(p.model);
  // Metered allowances need an API $/Mtok to normalise against; unmetered ones cost $0 regardless.
  if (!model || (!model.api && !p.unmetered)) continue;
  const planId = p.id.split("::")[0];
  if (isLegacyPlan(planId) || isExcludedPlan(planId)) continue;
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

// Codex shared resets: OpenAI's Codex team sometimes resets everyone's usage limits early. A confirmed reset is a
// completed event that applies to all plans (scope "all"); several posts on one day count once. Over the last
// RESET_WINDOW_DAYS, the mean gap between consecutive reset days says how often the weekly allowance refills, so a
// subscriber who uses it all gets 7 / gap weeks of allowance per week (never less than 1).
const RESET_WINDOW_DAYS = 90;
const RESET_PROVIDERS = ["OpenAI"];
const DAY_MS = 86_400_000;
function codexResets() {
  const end = Date.parse(resetHistory.fetched);
  const start = end - RESET_WINDOW_DAYS * DAY_MS;
  const dates = [
    ...new Set(
      resetHistory.items
        .filter((i) => i.eventKind === "completed" && i.status === "completed" && i.scope === "all")
        .map((i) => i.date)
        .filter((d) => Date.parse(d) > start && Date.parse(d) <= end),
    ),
  ].sort();
  const avgGapDays = dates.length > 1 ? (Date.parse(dates.at(-1)) - Date.parse(dates[0])) / DAY_MS / (dates.length - 1) : null;
  return {
    fetched: resetHistory.fetched,
    url: "https://resetbeacon.com/?filter=all",
    windowDays: RESET_WINDOW_DAYS,
    providers: RESET_PROVIDERS,
    dates,
    avgGapDays,
    multiplier: avgGapDays ? Math.max(1, 7 / avgGapDays) : 1,
  };
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  sources: {
    pricing: { name: "Real API Pricing", url: "https://github.com/Fei2411/real-api-pricing", snapshot: pricing.generatedAt },
    reference: { name: "mypriors FrontierCode 2.0", url: "https://mypriors.com/benchmarks/frontiercode-2.0-main" },
  },
  labs: LABS,
  // USD → currency multipliers for the currency select; every price in the data stays in USD.
  fx: { date: fx.date, source: "ECB reference rates via Frankfurter", rates: { USD: 1, ...fx.rates } },
  benchmarks,
  models,
  codexResets: codexResets(),
  plans: [...plans.values()].sort((a, b) => a.fee - b.fee || a.name.localeCompare(b.name)),
};
writeFileSync(new URL("src/data/frontiercode.json", root), JSON.stringify(out, null, 1) + "\n");
const cr = out.codexResets;
console.log(`Codex resets: ${cr.dates.length} in ${cr.windowDays} days, every ${cr.avgGapDays?.toFixed(2)} days → ×${cr.multiplier.toFixed(2)}`);
console.log(`${models.length} models, ${out.plans.length} plans, ${out.plans.reduce((n, p) => n + p.offers.length, 0)} plan×model offers`);
for (const b of benchmarks) console.log(`${b.name}: ${Object.keys(b.results).length} models, ${Object.values(b.results).flat().length} results`);
for (const m of models) console.log(m.short.padEnd(22), m.api ? `${m.api.usdPerMtok.toFixed(4)} ${m.api.basis}` : "no API $/Mtok");
