# danalytics

What a benchmark task costs when you pay with a subscription instead of the API.

Two benchmarks, picked from the select in the chart title (or `?benchmark=` in the URL):

- **Intelligence Index v5** (default): [Artificial Analysis](https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index) runs every reasoning-effort level of each model across nine evaluations and publishes an index score and an API cost per task.
- **FrontierCode 2.0**: [Cognition](https://cognition.com/frontiercode) reports a score and an API cost per task for every model and reasoning effort. GPT-6.1 Terra, which Cognition hasn't published yet, comes from Artificial Analysis's FrontierCode 2.0 run.

[Real API Pricing](https://github.com/Fei2411/real-api-pricing) measures how many tokens each subscription actually allows per month. The app joins the two and plots score against cost per task, with controls for:

- a **max monthly cost** slider and **fee bracket** select (≤ $20, $21–60, 5x, 20x, $250+)
- lab plans vs third-party tools (Cursor, OpenCode) and low-confidence allowances; only prices new customers can buy today are included
- GLM peak / blended / off-peak metering
- model and reasoning-effort selection, a log/linear cost axis and the Pareto frontier
- a display currency (USD, AUD, EUR, GBP, CAD, NZD, JPY, CNY, INR), converted at a dated ECB reference-rate snapshot in `data-src/fx.json`

Plans by model has its own page at `#/plans`.

Inspired by [mypriors' FrontierCode 2.0 page](https://mypriors.com/benchmarks/frontiercode-2.0-main).

## How a subscription task is priced

```
subscription $/task = API $/task × (plan $ per Mtok ÷ model API $ per Mtok)
```

Both per-token prices use Real API Pricing's token mixes (97% cache reads / 2.5% fresh input / 0.5% output; Anthropic bills fresh input as cache writes, Google uses the low-cache mix), so the ratio is the share of list price a subscriber pays when they use the whole allowance. For each model and effort the cheapest plan that passes the filters wins; models with no plan in range stay at their API price, drawn hollow.

Real API Pricing has no API price for some models. `scripts/build-data.mjs` documents the fallbacks:

| Model | API basis |
| --- | --- |
| GPT-6 Astra, GPT-6 Sol, GPT-6.1 Sol | Implied from mypriors' published ChatGPT Plus $/task |
| GPT-6 Luna | GPT-6 Sol × Factory Droid multiplier ratio (0.04 / 0.8) |
| Gemini 4 Argon | Launch list price $0.10 / $2 / $10, low-cache mix |
| GPT-6.1 Terra, DeepSeek V4.1 Flash 1017, Muse Wonder, SWE-1.x | No plan allowance measured yet: API price only |

Low-confidence allowances (estimates carried over from another model or plan tier, or a single report) are included by default and can be switched off in the sidebar; the leaderboard marks plans priced from one with ≈.

For GPT-6.1 Terra and DeepSeek V4.1 Flash 1017 on FrontierCode 2.0, the cost per task is Artificial Analysis's FrontierCode share of the Intelligence Index cost (× 6). That matches the cost from its FrontierCode token totals within 3%, and Cognition's own figures within a few percent, for models where both are published.

## Stack

Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui (radix-nova), [TanStack Charts](https://tanstack.com/charts) with a `d3-scale` log axis.

## Scripts

```sh
npm install
npm run dev            # http://localhost:5173
npm run build
npm run fetch-sources  # refresh data-src/ from Cognition, Real API Pricing and Frankfurter (FX rates)
npm run fetch-aa       # refresh data-src/artificial-analysis.json (one model page at a time, ~2 min)
npm run data           # rebuild src/data/frontiercode.json from data-src/
```
