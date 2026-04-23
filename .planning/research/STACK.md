# Technology Stack — v1.2 Additions

**Project:** ia-framework
**Milestone:** v1.2 — Chunking Tuning & Retrieval Quality
**Researched:** 2026-04-22
**Overall Confidence:** HIGH

> This document covers **only stack changes** for v1.2. The base stack plus v1.1 additions (Ollama SDK, dual-vector search, hybrid BM25+RRF, React dashboard with Recharts) are validated and unchanged.

## Verdict: No New Dependencies

v1.2 is a **tuning milestone**, not a features milestone. Every capability needed is already in the stack:

| v1.2 Feature                            | Existing Stack Coverage                                                                | New Deps? |
| --------------------------------------- | -------------------------------------------------------------------------------------- | --------- |
| Prompt engineering for chunk boundaries | Ollama SDK `chat()` with structured output — already integrated in v1.1                | **None**  |
| Prompt engineering for prose summaries  | Same Ollama `chat()` pipeline — change prompts, not code                               | **None**  |
| Score-based result filtering            | `SearchEngine.search()` already has `scoreThreshold` param, score merging, and sorting | **None**  |
| Adaptive score thresholds               | Basic statistics (mean, stddev, percentiles) — trivial math, no library needed         | **None**  |
| Dashboard tuning views                  | React 19 + Recharts 3.x — histograms, scatter plots, box plots all supported           | **None**  |
| Benchmark-driven validation             | Vitest + existing benchmark system (Hit@K, MRR) — already built in v1.0                | **None**  |

## What Changes (Code, Not Stack)

### 1. LLM Chunking Prompt Engineering

**Tool:** `ollama` ^0.6.3 (already installed)

Changes are prompt strings and output schema validation, not new technology:

- System prompts for chunk boundary detection — iterate prompt text
- System prompts for prose summary generation — iterate prompt text
- Possibly add few-shot examples to prompts (larger context window usage, not new deps)
- Zod schemas for structured output validation — already using `zod` ^4.3.6

### 2. Score-Based Result Filtering

**Tool:** Built-in `SearchEngine` in `packages/retrieval`

The search engine already implements score-based filtering via `scoreThreshold`. Improvements are algorithmic:

- **Adaptive thresholds:** Compute score distribution (mean, stddev) per query result set, filter outliers. This is ~20 lines of math, not a library.
- **Score gap detection:** Find natural breaks in sorted score arrays. Simple algorithm.
- **Per-vector-type thresholds:** Different cutoffs for text vs code vs BM25 vectors before RRF merge. Configuration change.

**Why NOT add a re-ranking library (cross-encoder, Cohere Rerank, etc.):**

- Project constraint: local-only via Ollama (cloud LLMs deferred to v3)
- Cross-encoder re-ranking via Ollama would add ~200ms latency per query for marginal gains at this scale
- Score-based filtering on existing embeddings is the right complexity level for pushing MRR from current to >0.7
- If MRR plateaus after tuning, cross-encoder re-ranking becomes a v1.3 consideration

### 3. Dashboard Tuning Views

**Tools:** React 19, Recharts 3.x, Vite 6.x (all already installed)

Recharts components needed for tuning views (all available in current version):

- `<BarChart>` — score distribution histograms
- `<ScatterChart>` — score vs relevance scatter plots
- `<LineChart>` — MRR trend over tuning iterations (already used in v1.0)
- `<ComposedChart>` — overlay multiple metrics
- `<ReferenceArea>` / `<ReferenceLine>` — threshold visualization on charts

No additional charting library needed.

## Alternatives Considered

| Category          | Decision               | Alternative                     | Why Not                                                                                |
| ----------------- | ---------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| Re-ranking        | Score-based filtering  | Cross-encoder via Ollama        | Adds latency, complexity. Try simpler approach first. Revisit in v1.3 if MRR plateaus. |
| Re-ranking        | Score-based filtering  | Cohere Rerank API               | Cloud dependency violates local-only constraint.                                       |
| Statistics        | Inline math (~20 LOC)  | `simple-statistics` npm package | Overkill — we need mean, stddev, and percentile. Three functions.                      |
| Visualization     | Recharts (existing)    | D3.js directly                  | Already have Recharts. Adding D3 for custom charts adds complexity with no benefit.    |
| Prompt management | Prompt strings in code | LangChain prompt templates      | Massive dependency for string interpolation. Template literals work fine.              |

## Integration Points

### Prompt Engineering → Benchmark Pipeline

```
Change prompt → Re-index sample corpus → Run benchmark → Compare MRR
```

No new wiring needed — the v1.0 benchmark system already supports this loop. The key integration is making prompt variants configurable (stored in project config or as named presets) so benchmarks can compare them.

### Score Filtering → Search Engine

The `SearchEngine.search()` and `SearchEngine.searchHybrid()` methods already return scored results sorted descending. Filtering improvements slot into the existing pipeline:

```
Embed query → Vector search → Score merge → [NEW: adaptive threshold] → Sort → Limit
```

### Dashboard → Metrics DB

Tuning views read from the same `better-sqlite3` metrics database. New tables/columns for:

- Per-query score distributions (stored during search)
- Prompt variant labels (stored during indexing)
- Before/after comparison data (stored during benchmarks)

## Installation

```bash
# No new packages to install for v1.2
# All dependencies are already present from v1.0 + v1.1
```

## Sources

- Existing codebase: `packages/retrieval/src/search-engine.ts` — confirmed score filtering already implemented
- Existing codebase: `packages/retrieval/src/types.ts` — `RetrievalQuery.scoreThreshold` already exists
- Recharts docs: Histogram, scatter, composed charts all available in v3.x (verified via v1.0 research)
- Ollama SDK: `chat()` with structured output verified in v1.1 research
