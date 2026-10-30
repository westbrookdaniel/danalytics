# danalytics

What a benchmark task costs when you pay with a subscription instead of the API.

Two benchmarks, picked from the select in the chart title (or `?benchmark=` in the URL):

- **Intelligence Index v5** (default): [Artificial Analysis](https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index) publishes an index score and an API cost per task for each model and reasoning effort.
- **FrontierCode 2.0**: [Cognition](https://cognition.com/frontiercode) publishes a score and an API cost per task for each model and reasoning effort. Models Cognition hasn't run yet use Artificial Analysis's FrontierCode 2.0 run instead.

[Real API Pricing](https://github.com/Fei2411/real-api-pricing) measures how many tokens each subscription actually allows. The app joins the two and plots score against cost per task, with filters for monthly price, plan type, models, reasoning effort and display currency. Plans by model has its own page at `/plans`.

Routing uses React Router with real paths, so a static host needs to serve `index.html` for unknown paths (an SPA rewrite).

Inspired by [mypriors' FrontierCode 2.0 page](https://mypriors.com/benchmarks/frontiercode-2.0-main).

## How a subscription task is priced

```
subscription $/task = API $/task × (plan $ per Mtok ÷ model API $ per Mtok)
```

The ratio is the share of list price a subscriber pays when they use their whole allowance. For each model and effort the cheapest plan that passes the filters wins; models with no plan in range stay at their API price, drawn hollow.

ChatGPT plans can also count OpenAI's early Codex limit resets, tracked by [Reset Beacon](https://resetbeacon.com/?filter=all), as extra allowance.

`scripts/build-data.mjs` documents the details: token mixes, API price fallbacks for models Real API Pricing doesn't price, hidden models, and how resets are counted.

## Stack

Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, [TanStack Charts](https://tanstack.com/charts).

## Scripts

```sh
npm install
npm run dev            # http://localhost:5173
npm run build
npm run fetch-sources  # refresh data-src/ from Cognition, Real API Pricing, Frankfurter (FX rates) and Reset Beacon
npm run fetch-aa       # refresh data-src/artificial-analysis.json (~2 min)
npm run data           # rebuild src/data/frontiercode.json from data-src/
```
