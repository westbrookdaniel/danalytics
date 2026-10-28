# danalytics

What a FrontierCode 2.0 task costs when you pay with a subscription instead of the API.

Cognition's [FrontierCode 2.0](https://cognition.com/frontiercode) reports a score and an API cost per task for every model and reasoning effort. [Real API Pricing](https://github.com/Fei2411/real-api-pricing) measures how many tokens each subscription actually allows per month. This app joins the two and plots score against cost per task on a log scale, with controls for:

- a **max monthly subscription cost** slider and **fee bracket** toggles (≤ $20, $21–60, 5x, 20x, $250+)
- lab plans vs third-party tools (Cursor, Factory Droid, OpenCode, Command Code, Ollama) and low-confidence allowances; only prices new customers can buy today are included
- GLM peak / blended / off-peak metering
- model and reasoning-effort selection, a log/linear cost axis and the Pareto frontier

Inspired by [mypriors' FrontierCode 2.0 page](https://mypriors.com/benchmarks/frontiercode-2.0-main). Penguin icon by [Ayub Irawan](https://thenounproject.com/icon/penguin-1798134/) from Noun Project (CC BY 3.0), redrawn as SVG.

## How a subscription task is priced

```
subscription $/task = API $/task × (plan $ per Mtok ÷ model API $ per Mtok)
```

Both per-token prices use Real API Pricing's token mixes (97% cache reads / 2.5% fresh input / 0.5% output; Anthropic bills fresh input as cache writes, Google uses the low-cache mix), so the ratio is the share of list price a subscriber pays when they use the whole allowance. For each model and effort the cheapest plan that passes the filters wins. Unmetered allowances (SWE-2 on Devin Pro, promo until 2026-10-31) cost $0 and sit on a "Free" tick.

Real API Pricing has no API price for some models. `scripts/build-data.mjs` documents the fallbacks:

| Model | API basis |
| --- | --- |
| GPT-6 Astra, GPT-6 Sol, GPT-6.1 Sol | Implied from mypriors' published ChatGPT Plus $/task |
| GPT-6 Luna | GPT-6 Sol × Factory Droid multiplier ratio (0.04 / 0.8) |
| Gemini 4 Argon | Launch list price $0.10 / $2 / $10, low-cache mix |
| Inkling Small, Mistral Large 4, Muse Wonder, SWE-1.x, Beam | No usable allowance: API price only |

## Stack

Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui (radix-nova), [TanStack Charts](https://tanstack.com/charts) with a `d3-scale` log axis.

## Scripts

```sh
npm install
npm run dev            # http://localhost:5173
npm run build
npm run fetch-sources  # refresh data-src/ from Cognition and Real API Pricing
npm run data           # rebuild src/data/frontiercode.json from data-src/
```
