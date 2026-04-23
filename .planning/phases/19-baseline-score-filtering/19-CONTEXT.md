# Phase 19: Baseline & Score Filtering - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

All measurement infrastructure in place — reproducible MRR baseline established, RRF score bug fixed, prompt versioning tracks changes, chunk validation reports coverage gaps, and mode-aware filtering stops dropping valid results.

Requirements: BASE-01, BASE-02, BASE-03, BASE-04, FILT-01

</domain>

<decisions>
## Implementation Decisions

### Baseline Reproducibility

- **D-01:** Frozen corpus is trust-based — document "don't re-index between runs". No tooling enforcement.
- **D-02:** 3-run average with stddev reported. No adaptive run count.
- **D-03:** Dedicated CLI subcommand: `ia-framework benchmark baseline` triggers 3x runs, averages MRR, stores result.
- **D-04:** Baseline stored as a tagged benchmark run in existing SQLite store (reuse `benchmark_runs` table with a `baseline` flag/tag).

### Score Threshold Fix

- **D-05:** Mode-aware defaults: dense = 0.3 (cosine), hybrid = 0.0 (rank-based), multi-collection RRF = 0.0 (rank-based).
- **D-06:** Mode detection lives at the engine level — SearchEngine picks the correct default based on query mode. MCP tools don't hardcode defaults.
- **D-07:** User can still override score threshold via MCP tool params (power-user escape hatch preserved).

### Prompt Versioning

- **D-08:** Auto-increment counter stored in project.json config. Developer bumps via `ia-framework prompt bump` CLI command.
- **D-09:** Prompt version is part of the cache key: `sha256(content):model:promptVersion`. Changing prompt version auto-invalidates cached chunks.
- **D-10:** Prompt version stored as collection-level metadata in Qdrant so developers can trace which prompt produced which chunks.
- **D-11:** CLI command `ia-framework prompt bump` increments the version counter and prints the new version number.

### Chunk Validation

- **D-12:** Report-only — validation warns about violations but does not block indexing. Developer reviews report and decides.
- **D-13:** Validation auto-runs after every LLM index operation. No separate standalone command needed (Phase 19 scope).
- **D-14:** Per-file summary report: X files checked, Y with gaps, Z with overlaps. Lists worst offenders.
- **D-15:** Four violation checks: gaps (missing lines), overlaps (duplicated lines), out-of-bounds (startLine/endLine beyond file length), empty summaries.

### Agent's Discretion

- Exact SQLite schema changes for baseline tagging
- Validation report format details (console output vs file)
- How prompt version counter initializes (start at 1 or 0)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Score filtering & RRF

- `packages/retrieval/src/search-engine.ts` — Current threshold logic (lines 63, 74, 80), where mode-aware defaults must be added
- `packages/retrieval/src/multi-collection-search-engine.ts` — Multi-collection RRF layer (lines 50-63), threshold passthrough
- `packages/retrieval/src/rrf.ts` — RRF implementation, k=60, output scores ~0.01-0.03
- `packages/mcp-server/src/tools/search-codebase.ts` — MCP tool hardcoding 0.3 default (line 69)
- `packages/mcp-server/src/tools/search-codebase-hybrid.ts` — Hybrid MCP tool threshold
- `packages/vector-store/src/qdrant.ts` — Where scoreThreshold maps to Qdrant param (line 117)

### Benchmark infrastructure

- `packages/benchmark/src/benchmark-runner.ts` — Core runner, MRR calculation (lines 60-62)
- `packages/benchmark/src/benchmark-store.ts` — SQLite persistence, schema for runs
- `packages/benchmark/src/types.ts` — BenchmarkConfig, BenchmarkRun types
- `packages/cli/src/commands/benchmark.command.ts` — CLI subcommands (run, list, compare)

### LLM chunking & prompt

- `packages/indexer/src/strategies/llm-strategy.ts` — LLM chunking strategy, no promptVersion field yet
- `packages/indexer/src/strategies/llm-cache.ts` — Cache key is sha256(content):model, needs prompt version added
- `packages/indexer/src/strategies/prompt.ts` — Prompt file, no version identifier

### Requirements

- `.planning/REQUIREMENTS.md` — BASE-01 through BASE-04, FILT-01 definitions

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `benchmark-runner.ts`: Already computes MRR, Hit@K, avgLatencyMs — extend for 3x averaging
- `benchmark-store.ts`: SQLite schema with `mrr REAL`, `reciprocal_rank REAL` — add baseline tag column
- `SearchEngine`: Already has `defaultScoreThreshold` config — refactor to mode-aware
- `rrf.ts`: Clean RRF implementation — no changes needed, just threshold handling around it
- `llm-cache.ts`: Cache key generation — extend key format to include prompt version

### Established Patterns

- CLI commands use Commander.js with subcommand pattern (see `benchmark.command.ts`)
- Qdrant collections use `{project}` for AST, `{project}-llm` for LLM (Phase 14 convention)
- Config stored in `.ia-framework/project.json` via cosmiconfig

### Integration Points

- SearchEngine mode detection: needs to know if query is dense, hybrid, or multi-collection
- MultiCollectionSearchEngine: may need to signal its mode to child engines
- LLM strategy → cache: cache key generation must include prompt version
- Qdrant collection metadata: store prompt version at collection level during indexing

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 19-baseline-score-filtering_
_Context gathered: 2026-04-22_
