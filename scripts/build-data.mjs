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
const opencodeGo = read("data-src/opencode-go.json");

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
  "Kimi K3": { pricingId: "kimi-k3", lab: "Open weights", short: "Kimi K3", openWeights: true },
  "GLM 5.3": { pricingId: "glm-5.3", lab: "Open weights", short: "GLM 5.3", openWeights: true },
  "GLM 5.3 Flash": { pricingId: "glm-5.3-flash", lab: "Open weights", short: "GLM 5.3 Flash", openWeights: true },
  "Muse Wonder 1.0": { pricingId: null, lab: "Other", short: "Muse Wonder 1.0" },
  // DeepSeek's 2026-10-17 snapshot. Real API Pricing only measures the original V4.1 Flash, so
  // this has no plan allowances of its own and charts at API price.
  "DeepSeek V4.1 Flash 1017": { pricingId: "deepseek-v4.1-flash-1017", lab: "Open weights", short: "DeepSeek V4.1 Flash 1017", openWeights: true },
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

function apiPrice(pricingId, lab, id) {
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
  const aaPrice = aa.models[id]?.find((c) => c.prices?.input != null)?.prices;
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
// Cursor's measured Ultra is the legacy plan (closed to new customers since its 2026-10 relaunch); the new Ultra
// includes no third-party models and publishes no pool size, so Cursor drops out for now.
const LEGACY_PLANS = new Set(["kimi_moderato_cn", "kimi_allegretto_cn", "kimi_allegro_cn", "cursor_ultra"]);
const isLegacyPlan = (planId) => LEGACY_PLANS.has(planId) || /^glm_coding_\w+_cn_old_/.test(planId);
// Resellers left out of the comparison: Factory Droid, Ollama, Devin and Command Code. Also left out: MiniMax's
// annual-billing rows (every other plan here is monthly) and MiMo's night-only readings, which assume you code
// only in Beijing off-peak hours; the day reading is the honest default.
const isExcludedPlan = (planId) => /^(droid_|ollama_|devin_|command_code_)/.test(planId) || /_annual$/.test(planId) || /^mimo_token_\w+_night$/.test(planId);

const PLAN_META = {
  claude_pro: { name: "Claude Pro", provider: "Anthropic", kind: "lab" },
  // Renamed around 2026-10-30: Max 5x is now "Max" (5× Pro) and Max 20x is "Ultra" (10× Pro weekly, no five-hour
  // limit once verified). Plan ids upstream keep the old names. claude.com/pricing, read 2026-11-04.
  claude_max_5x: { name: "Claude Max", provider: "Anthropic", kind: "lab" },
  claude_team: { name: "Claude Team Premium", provider: "Anthropic", kind: "lab" },
  claude_max_20x: { name: "Claude Ultra", provider: "Anthropic", kind: "lab" },
  chatgpt_plus: { name: "ChatGPT Plus", provider: "OpenAI", kind: "lab" },
  // Renamed to Pro 100 / Pro 200 below, with the Oct 2026 allowance changes.
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
  droid_pro: { name: "Factory Droid Pro", provider: "Factory", kind: "tool" },
  droid_max: { name: "Factory Droid Max", provider: "Factory", kind: "tool" },
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
  const mimo = planId.match(/^mimo_token_(lite|standard|pro|max)_day$/);
  if (mimo) return { name: `MiMo Token ${cap(mimo[1])}`, provider: "Xiaomi", kind: "lab" };
  // MiniMax sells its token plans in China and globally at different prices; the M Plan is China-only.
  const minimax = planId.match(/^minimax_token_(plus|max|ultra)_(cn|global)$/);
  if (minimax) return { name: `MiniMax Token ${cap(minimax[1])}${minimax[2] === "cn" ? " (China)" : ""}`, provider: "MiniMax", kind: "lab" };
  const mPlan = planId.match(/^minimax_m_plan_(go|explore|build)_cn$/);
  if (mPlan) return { name: `MiniMax M Plan ${cap(mPlan[1])} (China)`, provider: "MiniMax", kind: "lab" };
  return PLAN_META[planId] ?? null;
}
const cap = (w) => w[0].toUpperCase() + w.slice(1);

const modelId = (name) => name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");

// Models Cognition hasn't run yet; their results come only from Artificial Analysis.
const EXTRA_MODELS = {
  "GPT-6.1 Terra": { pricingId: "gpt-6.1-terra", lab: "OpenAI", short: "GPT-6.1 Terra" },
  // Proprietary, unlike Kimi K3. Real API Pricing's Kimi plan rows are adopted as kimi-k3 only (the K3.1 Pro
  // sample that re-based them is research-only), so this charts at API price.
  "Kimi K3.1 Pro": { pricingId: "kimi-k3.1-pro", lab: "Other", short: "Kimi K3.1 Pro" },
  // Proprietary; only OpenCode Go among the plans kept here serves it.
  "Qwen3.8 Max": { pricingId: "qwen3.8-max", lab: "Other", short: "Qwen3.8 Max" },
  "MiMo V2.6 Pro": { pricingId: "mimo-v2.6-pro", lab: "Open weights", short: "MiMo V2.6 Pro", openWeights: true },
  // Real API Pricing measures the preview; Artificial Analysis runs the release under the same name.
  "MiniMax M3.1 Flash": { pricingId: "minimax-m3.1-flash-preview", lab: "Open weights", short: "MiniMax M3.1 Flash", openWeights: true },
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
    api: apiPrice(meta.pricingId, meta.lab, modelId(name)),
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

// Artificial Analysis reports each evaluation's cost per task weighted by its share of the Intelligence Index
// (the weighted costs sum to the index cost). Weights from its v5.0.1 methodology page
// (artificialanalysis.ai/methodology/intelligence-benchmarking): FrontierCode 2.0 is 3/20.
const AA_EVAL_WEIGHT = { "frontiercode-2-0": 3 / 20 };

/** API $/task for one evaluation in an Artificial Analysis run, from the index cost breakdown. */
function aaEvalCost(config, slug) {
  const ev = config.intelligenceIndexEvalCosts?.find((e) => e.slug === slug);
  return ev ? ev.weightedCostPerTask / AA_EVAL_WEIGHT[slug] : null;
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
      .map((c) => ({ c, cost: aaEvalCost(c, "frontiercode-2-0") }))
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
  // OpenCode Go comes from its official per-model table below instead.
  if (isLegacyPlan(planId) || isExcludedPlan(planId) || planId === "opencode_go") continue;
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

// OpenCode Go publishes a monthly dollar limit per model, charged at its own token prices, so a model's tokens per
// month are that limit over its OpenCode price on the model's usual mix. The allowance is one shared pool: each
// model's limit says how much of it a month of that model uses ("determines how its usage counts toward those
// allowances"), like every other plan here.
for (const { id, name, fee, column } of opencodeGo.plans) {
  const offers = [];
  for (const [modelKey, m] of Object.entries(opencodeGo.models)) {
    const model = models.find((x) => x.id === modelKey);
    if (!model?.api) continue;
    const mtokPerMonth = m.limits[column] / blend({ cached: m.cached, input: m.input, output: m.output }, mixFor(model.lab));
    offers.push({
      modelId: model.id,
      usdPerMtok: fee / mtokPerMonth,
      unmetered: false,
      promoUntil: null,
      confidence: "high",
      dataDate: opencodeGo.read,
      source: `${opencodeGo.source}: $${m.limits[column]}/month for ${m.label} at $${m.cached} / $${m.input} / $${m.output}`,
    });
  }
  plans.set(id, { id, name, provider: "OpenCode", kind: "tool", scenario: null, group: id, fee, localPrice: null, offers });
}

// --- Plan revisions since the Real API Pricing snapshot ---------------------------------------------------------
// Vendors renamed, repriced and added tiers after the snapshot was measured. Each change below cites the official
// page it follows (all read 2026-11-04). Allowances that are scaled from another plan by a published multiple,
// rather than measured, are marked low-confidence.

const tokensPerMonth = (plan, offer) => plan.fee / offer.usdPerMtok;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];

/** Copy a plan under a new id, fee and allowance multiple (tokens × scale). */
function derivePlan(fromId, { id, name, fee, scale, note, provider, confidence = "low" }) {
  const from = plans.get(fromId);
  if (!from) throw new Error(`derivePlan: no plan ${fromId}`);
  plans.set(id, {
    ...from,
    id,
    name,
    fee,
    provider: provider ?? from.provider,
    group: id,
    localPrice: null,
    offers: from.offers.map((o) => ({
      ...o,
      usdPerMtok: fee / (tokensPerMonth(from, o) * scale),
      confidence: confidence === "keep" ? o.confidence : "low",
      source: `${note} (scaled from ${from.name}: ${o.source.slice(0, 160)})`,
    })),
  });
}

/** Scale a plan's allowance in place. */
function scaleAllowance(planId, scale, note) {
  const plan = plans.get(planId);
  for (const o of plan.offers) {
    o.usdPerMtok /= scale;
    o.source = `${note}; ${o.source}`;
  }
}

// OpenAI (help.openai.com/en/articles/9793128 "About ChatGPT Pro tiers", learn.chatgpt.com/docs/pricing). The Pro
// tiers are now named by price. Pro 100 was measured at 5× Plus and OpenAI doubled its allowance on 2026-10-29;
// Pro 200's measurement already matches the unified higher allowance (≈ 20× Plus). Pro 500 (launched 2026-09-29) has
// no measurement: it was 25× Plus at launch and doubled on 2026-10-29, so ≈ 50× Plus, i.e. 2.5× Pro 200.
plans.get("chatgpt_pro_5x").name = "ChatGPT Pro 100";
plans.get("chatgpt_pro_20x").name = "ChatGPT Pro 200";
scaleAllowance("chatgpt_pro_5x", 2, "Doubled 2026-10-29 (OpenAI release notes)");

// OpenAI models with no measured allowance on ChatGPT Plus (GPT-6.1 Terra so far) are estimated from Codex's
// published credit rates. Every model draws on one credit budget per plan, so a model's tokens per month scale with
// the inverse of its credits per token. Take the best-rated measured Plus offer whose model has a rate (ties go to the
// closest rate, so the extrapolation is smallest: GPT-6.1 Sol for Terra) and scale by the two models' credits per Mtok
// on the standard mix. Credits per Mtok (input / cached input / output) from learn.chatgpt.com/docs/pricing.
const CODEX_CREDITS = {
  "gpt-6-astra": { input: 250, cached: 25, output: 1250 },
  "gpt-6.1-sol": { input: 50, cached: 2.5, output: 250 },
  "gpt-6.1-terra": { input: 25, cached: 1.25, output: 125 },
  "gpt-6-sol": { input: 50, cached: 5, output: 250 },
  "gpt-6-luna": { input: 2.5, cached: 0.25, output: 12.5 },
  "gpt-5.6-sol": { input: 100, cached: 10, output: 500 },
};
const CONFIDENCE_RANK = { high: 0, medium: 1, low: 2 };
const creditsPerMtok = (id) => blend(CODEX_CREDITS[id], MIX.standard);
const plus = plans.get("chatgpt_plus");
for (const model of models) {
  if (!CODEX_CREDITS[model.id] || !model.api || plus.offers.some((o) => o.modelId === model.id)) continue;
  const distance = (o) => Math.abs(Math.log(creditsPerMtok(o.modelId) / creditsPerMtok(model.id)));
  const anchor = plus.offers
    .filter((o) => CODEX_CREDITS[o.modelId] && !o.unmetered)
    .sort((a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] || distance(a) - distance(b))[0];
  if (!anchor) continue;
  const ratio = creditsPerMtok(model.id) / creditsPerMtok(anchor.modelId);
  plus.offers.push({
    modelId: model.id,
    usdPerMtok: anchor.usdPerMtok * ratio,
    unmetered: false,
    promoUntil: null,
    confidence: "low",
    dataDate: anchor.dataDate,
    source: `Estimated from Codex credit rates: ${+ratio.toFixed(3)} × the ${anchor.modelId} allowance's $/Mtok on Plus (learn.chatgpt.com/docs/pricing)`,
  });
}

// Pro tiers measured only some models. Fill the rest from Plus at the tier's own measured multiple of Plus (the
// median token ratio over the models both measured), so every model sees the same tier multiple.
for (const plan of [plans.get("chatgpt_pro_5x"), plans.get("chatgpt_pro_20x")]) {
  const shared = plan.offers.map((o) => [o, plus.offers.find((p) => p.modelId === o.modelId)]).filter(([, p]) => p);
  const multiple = median(shared.map(([o, p]) => tokensPerMonth(plan, o) / tokensPerMonth(plus, p)));
  for (const p of plus.offers) {
    if (plan.offers.some((o) => o.modelId === p.modelId)) continue;
    plan.offers.push({
      ...p,
      usdPerMtok: plan.fee / (tokensPerMonth(plus, p) * multiple),
      confidence: "low",
      source: `${+multiple.toFixed(1)}× the Plus allowance (this tier's measured multiple); Plus: ${p.source.slice(0, 160)}`,
    });
  }
}
derivePlan("chatgpt_pro_20x", { id: "chatgpt_pro_500", name: "ChatGPT Pro 500", fee: 500, scale: 2.5, note: "≈ 50× Plus: 25× at launch, doubled 2026-10-29" });

// Google (support.google.com/googleone/answer/16286513): AI Ultra comes in 5× and 20× the AI Pro quota.
derivePlan("google_ai_pro_us", { id: "google_ai_ultra_5x", name: "Google AI Ultra 5x", fee: 99.99, scale: 5, note: "5× the AI Pro quota" });
derivePlan("google_ai_pro_us", { id: "google_ai_ultra_20x", name: "Google AI Ultra 20x", fee: 199.99, scale: 20, note: "20× the AI Pro quota" });

// xAI replaced SuperGrok with The X Subscription on 2026-10-12 (cursor.com/pricing): Plus $8, Premium $30, Super $100
// and Ultra $200 at 1× / 4× / 15× / 50× Plus. No pool size is published. Premium replaces SuperGrok at the same price,
// so it takes SuperGrok's measured allowance and the others scale from it; xAI says each new tier gives more usage per
// dollar than the one it replaces, so these are likely conservative.
for (const [id, name, fee, multiple] of [
  ["x_plus", "X Subscription Plus", 8, 1],
  ["x_premium", "X Subscription Premium", 30, 4],
  ["x_super", "X Subscription Super", 100, 15],
  ["x_ultra", "X Subscription Ultra", 200, 50],
]) {
  derivePlan("supergrok", { id, name, fee, scale: multiple / 4, note: `${multiple}× X Subscription Plus; Premium anchored on legacy SuperGrok` });
}
for (const id of ["supergrok", "supergrok_plus", "supergrok_heavy"]) plans.delete(id);

// Kimi's China plans were listed at the international USD prices. They are CNY plans (kimi.com membership pricing):
// convert the CNY price at the FX snapshot; the allowance in tokens is unchanged.
for (const plan of plans.values()) {
  if (plan.provider !== "Moonshot") continue;
  const cny = Number(plan.localPrice?.replace(/[^\d.]/g, ""));
  if (!cny) throw new Error(`Kimi plan ${plan.id} has no CNY price`);
  const fee = +(cny / fx.rates.CNY).toFixed(2);
  for (const o of plan.offers) o.usdPerMtok *= fee / plan.fee;
  plan.fee = fee;
  plan.name = `${plan.name} (China)`;
}

// GLM Coding sells the same credits internationally on z.ai at $18 / $80 / $168 (docs.z.ai/devpack/overview).
const GLM_INTL_FEE = { lite: 18, pro: 80, max: 168 };
for (const plan of [...plans.values()]) {
  const tier = plan.id.match(/^glm_coding_(lite|pro|max)_cn_new_/)?.[1];
  if (!tier) continue;
  const id = plan.id.replace("_cn_new_", "_intl_");
  plans.set(id, {
    ...plan,
    id,
    name: `${plan.name} (z.ai)`,
    fee: GLM_INTL_FEE[tier],
    group: `glm_coding_${tier}_intl`,
    localPrice: null,
    offers: plan.offers.map((o) => ({ ...o, usdPerMtok: (o.usdPerMtok * GLM_INTL_FEE[tier]) / plan.fee, source: `z.ai price, same credits as the China plan; ${o.source}` })),
  });
  plan.name = `${plan.name} (China)`;
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
