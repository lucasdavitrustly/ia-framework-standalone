# Architecture Patterns

**Domain:** Chunking Tuning & Retrieval Quality (v1.2)
**Researched:** 2026-04-22
**Focus:** Integration of prompt engineering, score-based filtering, and dashboard tuning views into existing architecture

## Recommended Architecture

Three workstreams that touch different layers but share the benchmark feedback loop:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Dashboard (apps/dashboard)                    │
│  NEW: Prompt editor view, chunk quality inspector, filter tuner │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────────────┐
│              Dashboard API (packages/dashboard-api)              │
│  NEW: /api/tuning routes (prompt CRUD, chunk analysis, filter   │
│       config), /api/benchmarks extensions (before/after diffs)  │
└──────┬───────────────────┬──────────────────────────────────────┘
       │                   │
┌──────▼───────┐   ┌──────▼──────────────────────────────────────┐
│  Benchmark   │   │         Retrieval (packages/retrieval)       │
│  (benchmark) │   │  MODIFY: SearchEngine.search() — add        │
│  unchanged   │   │  adaptive score filtering (score gap, top-N  │
│  runner API  │   │  relative threshold). MultiCollection — pass │
│              │   │  filter config through.                      │
└──────────────┘   └──────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────────┐
│              Indexer (packages/indexer)                          │
│  MODIFY: prompt.ts — make prompt template a configurable entity │
│  NEW: PromptRegistry — named prompt versions, A/B comparison    │
│  MODIFY: llm-chunker.ts — accept prompt template parameter      │
└─────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component                                        | Responsibility                   | Change Type                                          | Communicates With                                  |
| ------------------------------------------------ | -------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| `packages/indexer/src/strategies/prompt.ts`      | Prompt template for LLM chunking | **MODIFY** — extract to configurable template system | llm-chunker, dashboard-api                         |
| `packages/indexer/src/strategies/llm-chunker.ts` | LLM chunking orchestration       | **MODIFY** — accept prompt template param            | prompt.ts, ollama-client                           |
| `packages/retrieval/src/search-engine.ts`        | Dense+hybrid search              | **MODIFY** — add adaptive score filtering            | vector-store, mcp-server                           |
| `packages/retrieval/src/types.ts`                | Retrieval types                  | **MODIFY** — add ScoreFilterConfig to query/config   | all consumers                                      |
| `packages/dashboard-api/src/app.ts`              | API routing                      | **MODIFY** — mount tuning router                     | new tuning routes                                  |
| `packages/dashboard-api/src/routes/tuning.ts`    | Tuning API endpoints             | **NEW**                                              | prompt registry, benchmark store, retrieval config |
| `packages/core/src/config/schema.ts`             | Project config validation        | **MODIFY** — add retrieval.scoreFilter config        | config consumers                                   |
| `apps/dashboard` (React)                         | Dashboard UI                     | **NEW views**                                        | dashboard-api                                      |

### Data Flow

#### 1. Prompt Engineering Flow

```
Developer edits prompt in dashboard
  → POST /api/tuning/prompts {name, template}
  → Saved to prompts.json in .ia-framework/
  → Re-index with new prompt (CLI or dashboard trigger)
  → Run benchmark → compare MRR before/after
```

#### 2. Score Filtering Flow

```
Search query arrives (MCP or dashboard)
  → SearchEngine.search() runs as today
  → NEW: ScoreFilter applied post-merge, pre-return
    → Strategies: absolute threshold, relative (% of top score), score gap detection
  → Filtered results returned
  → Dashboard shows filter effectiveness (how many removed, score distribution)
```

#### 3. Dashboard Tuning View Flow

```
Dashboard loads tuning page
  → GET /api/tuning/prompts → list prompt versions
  → GET /api/tuning/chunks?strategy=llm → chunk quality stats
  → GET /api/tuning/filter-config → current filter settings
  → GET /api/benchmarks?compare=true → before/after benchmark pairs
```

## Patterns to Follow

### Pattern 1: Configurable Prompt Templates (PromptRegistry)

**What:** Extract the hardcoded prompt in `prompt.ts` into a named, versioned template system. The current `buildPrompt()` stays as the default; new templates can be saved alongside it.

**When:** LLM chunking prompt engineering — any change to the prompt.

**Why not just edit prompt.ts directly?** Because we need before/after comparison. The developer must be able to re-index with prompt A, benchmark, then re-index with prompt B, benchmark, and compare. A registry of named templates makes this trivial.

**Implementation:**

```typescript
// packages/indexer/src/strategies/prompt-registry.ts (NEW)
export interface PromptTemplate {
  name: string; // e.g. "default", "v2-concise", "v3-boundary-focus"
  template: string; // The prompt text with {{sourceCode}} and {{fileName}} placeholders
  createdAt: string;
  description?: string;
}

export class PromptRegistry {
  constructor(private readonly configDir: string) {}

  list(): PromptTemplate[] {
    /* read from .ia-framework/prompts.json */
  }
  get(name: string): PromptTemplate | null {
    /* ... */
  }
  save(template: PromptTemplate): void {
    /* ... */
  }

  /** Build a prompt from a named template */
  buildPrompt(templateName: string, sourceCode: string, fileName: string): string {
    const tmpl = this.get(templateName);
    if (!tmpl) return buildPromptDefault(sourceCode, fileName); // fallback
    return renderTemplate(tmpl.template, sourceCode, fileName);
  }
}
```

**Integration point:** `LlmChunkingStrategy.chunk()` accepts an optional `promptTemplate` name. The pipeline passes it from config. `buildPrompt()` in `prompt.ts` becomes the "default" template — zero breaking changes.

### Pattern 2: Adaptive Score Filtering

**What:** Post-search filter that removes low-quality results using strategies beyond a fixed threshold.

**When:** Every search query, controlled by config.

**Implementation — add to `packages/retrieval/src/score-filter.ts` (NEW):**

```typescript
export interface ScoreFilterConfig {
  /** Absolute minimum score (existing behavior, default 0.5) */
  absoluteThreshold?: number;
  /** Keep results within this fraction of top score (e.g. 0.6 = keep if score >= 60% of best) */
  relativeThreshold?: number;
  /** Drop results after a score gap > this fraction between consecutive results */
  gapThreshold?: number;
}

export function filterByScore(
  results: RetrievalResult[],
  config: ScoreFilterConfig,
): RetrievalResult[] {
  if (results.length === 0) return results;

  const topScore = results[0].score;
  let filtered = results;

  // Relative threshold: keep if score >= relativeThreshold * topScore
  if (config.relativeThreshold !== undefined) {
    const minScore = topScore * config.relativeThreshold;
    filtered = filtered.filter((r) => r.score >= minScore);
  }

  // Gap detection: find largest score drop, truncate there
  if (config.gapThreshold !== undefined) {
    for (let i = 1; i < filtered.length; i++) {
      const gap = filtered[i - 1].score - filtered[i].score;
      if (gap / topScore > config.gapThreshold) {
        filtered = filtered.slice(0, i);
        break;
      }
    }
  }

  return filtered;
}
```

**Integration point:** Called inside `SearchEngine.search()` after the merge+sort, before `slice(0, limit)`. Config comes from `SearchEngineConfig` (new optional field) or per-query override. The `MultiCollectionSearchEngine` passes config through — it doesn't filter itself (individual engines do, or it applies after RRF merge).

**Key decision:** Apply filtering **after RRF merge** in `MultiCollectionSearchEngine`, not inside individual engines. Reason: RRF scores are on a different scale than cosine similarity — filtering pre-merge on cosine then post-merge on RRF would be inconsistent. Apply once, post-merge, using the final RRF scores.

### Pattern 3: Dashboard Tuning Router

**What:** New Hono router mounted at `/api/tuning` with endpoints for prompt management, chunk analysis, and filter configuration.

**When:** Dashboard tuning views need data.

```typescript
// packages/dashboard-api/src/routes/tuning.ts (NEW)
export function tuningRouter(deps: TuningDeps): Hono {
  const app = new Hono();

  // Prompt management
  app.get('/prompts', ...);           // List all prompt templates
  app.post('/prompts', ...);          // Save a new prompt template
  app.get('/prompts/:name', ...);     // Get specific template

  // Chunk quality analysis
  app.get('/chunk-stats', ...);       // Avg chunk size, summary length, coverage gaps
  app.get('/chunk-samples', ...);     // Sample chunks for manual inspection

  // Score filter config
  app.get('/filter-config', ...);     // Current filter settings
  app.put('/filter-config', ...);     // Update filter settings

  // Before/after comparison
  app.get('/comparisons', ...);       // Benchmark pairs tagged with config changes

  return app;
}
```

**Integration:** Mounted in `app.ts` alongside existing routers. Depends on `PromptRegistry`, `BenchmarkStoreDep`, and a new `ChunkAnalyzer` utility.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Editing prompt.ts In-Place Without Versioning

**What:** Directly modifying the hardcoded prompt string and re-indexing.
**Why bad:** No before/after comparison. Can't roll back. Can't A/B test. Violates the benchmark-driven validation requirement.
**Instead:** Use PromptRegistry with named templates. Keep the current prompt as "default".

### Anti-Pattern 2: Filtering Inside Individual Engines Before RRF

**What:** Applying score filtering in each `SearchEngine.search()` before results reach `MultiCollectionSearchEngine.rrfMerge()`.
**Why bad:** Cosine similarity scores from different collections aren't comparable. Aggressive filtering in one engine could starve RRF of candidates, degrading merged quality.
**Instead:** Apply score filtering **once** after RRF merge in `MultiCollectionSearchEngine`, where all results are on the same RRF score scale. Individual engines use only the existing absolute `scoreThreshold` as a floor.

### Anti-Pattern 3: Storing Prompt Templates in the Database

**What:** Using better-sqlite3 or Qdrant to store prompt templates.
**Why bad:** Prompts are config, not data. They should be version-controllable, human-editable, and co-located with project config.
**Instead:** Store as JSON file in `.ia-framework/prompts.json`. Simple, diffable, no migration needed.

### Anti-Pattern 4: Complex Prompt Templating Engine

**What:** Building a full Handlebars/Mustache/Jinja-like template system.
**Why bad:** Over-engineering. Prompts need two variables: `sourceCode` and `fileName`. String replacement is sufficient.
**Instead:** Simple `{{sourceCode}}` and `{{fileName}}` placeholder replacement. One function, no dependencies.

## New Components Summary

| Component            | Package                  | Type            | Purpose                                                               |
| -------------------- | ------------------------ | --------------- | --------------------------------------------------------------------- |
| `prompt-registry.ts` | indexer                  | NEW file        | Named prompt template CRUD, storage in .ia-framework/prompts.json     |
| `score-filter.ts`    | retrieval                | NEW file        | Adaptive score filtering (relative threshold, gap detection)          |
| `routes/tuning.ts`   | dashboard-api            | NEW file        | REST API for prompt management, chunk analysis, filter config         |
| `ChunkAnalyzer`      | indexer or dashboard-api | NEW utility     | Compute chunk quality stats (avg size, summary quality, coverage)     |
| Tuning views         | apps/dashboard           | NEW React pages | Prompt editor, chunk inspector, filter tuner, before/after comparison |

## Modified Components Summary

| Component                           | Package       | Change                                                                                     |
| ----------------------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| `prompt.ts`                         | indexer       | Export default template as named constant; `buildPrompt()` becomes wrapper around registry |
| `llm-chunker.ts`                    | indexer       | Accept optional `promptTemplate` name parameter                                            |
| `llm-strategy.ts`                   | indexer       | Pass prompt template from config to chunker                                                |
| `types.ts` (ChunkingConfig)         | indexer       | Add optional `promptTemplate` field                                                        |
| `search-engine.ts`                  | retrieval     | Call `filterByScore()` after merge, accept `ScoreFilterConfig`                             |
| `multi-collection-search-engine.ts` | retrieval     | Apply score filter after RRF merge                                                         |
| `types.ts` (SearchEngineConfig)     | retrieval     | Add optional `scoreFilter` field                                                           |
| `types.ts` (RetrievalQuery)         | retrieval     | Add optional per-query filter override                                                     |
| `schema.ts`                         | core          | Add `retrieval.scoreFilter` config section                                                 |
| `app.ts`                            | dashboard-api | Mount tuning router                                                                        |

## Suggested Build Order

Based on dependency analysis — each step is testable independently:

1. **PromptRegistry** (indexer) — No deps on other new code. Pure file I/O + template rendering. Enables prompt versioning immediately.

2. **Prompt integration** (indexer) — Wire PromptRegistry into LlmChunkingStrategy. Modify `buildPrompt` to delegate to registry. Existing tests validate no regression.

3. **ScoreFilter** (retrieval) — Pure function, no deps on other new code. Unit testable with mock results. Add to SearchEngine and MultiCollectionSearchEngine.

4. **Config schema updates** (core) — Add `scoreFilter` and `promptTemplate` to project config schema. Small, isolated change.

5. **Tuning API routes** (dashboard-api) — Depends on PromptRegistry and ScoreFilter config types. CRUD endpoints + chunk analysis.

6. **Dashboard tuning views** (apps/dashboard) — Depends on tuning API. Prompt editor, chunk inspector, filter tuner, benchmark comparison.

7. **Benchmark-driven validation** — Wire everything together: change prompt → re-index → benchmark → compare. This is integration testing of the full loop.

**Rationale:** Backend-first (steps 1-4) enables CLI-driven tuning immediately. Dashboard views (5-6) add visibility. Integration (7) validates the full workflow. Each step produces benchmark-measurable improvements.

## Sources

- Existing codebase analysis (HIGH confidence — direct code inspection)
- RRF paper conventions for score-scale awareness (HIGH confidence — established IR practice)
- Qdrant filtering docs via Context7 (HIGH confidence — verified in v1.0/v1.1)
