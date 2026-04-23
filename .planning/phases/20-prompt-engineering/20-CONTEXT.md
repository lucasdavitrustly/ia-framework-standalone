# Phase 20: Prompt Engineering - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

LLM chunking produces higher-quality chunks with better boundaries and intent-focused summaries, measurably improving MRR toward 0.7. Includes few-shot examples in prompt, class grouping enforcement, intent-focused summary generation, heuristic quality scoring, and CLI A/B comparison of prompt versions.

Requirements: PRMT-01, PRMT-02, PRMT-03, PRMT-04, PRMT-05

</domain>

<decisions>
## Implementation Decisions

### Few-shot example design

- **D-01:** Inline few-shot examples embedded directly in the prompt template — 1 good boundary example + 1 bad boundary example showing the contrast.
- **D-02:** Default examples use Java (matches primary target project use case).
- **D-03:** Examples are config-driven at runtime — loaded from `.ia-framework/prompt-examples/` directory so developers can swap, add, or customize examples for their language/codebase without modifying framework source.
- **D-04:** Framework ships with default Java examples; devs can add files for other languages. If no custom examples exist, defaults are used.

### Summary quality criteria

- **D-05:** Quality scoring uses heuristic rules only — no second LLM call. Checks include: minimum length, absence of raw code tokens (camelCase/snake_case identifiers), presence of purpose verbs (handles, validates, orchestrates, manages, etc.).
- **D-06:** Score output is numeric 0-100, computed from weighted heuristic checks.
- **D-07:** Quality scores stored as Qdrant point metadata on each chunk — queryable for filtering and reporting.
- **D-08:** Low-quality summaries surfaced via end-of-run summary after indexing: count of low-quality chunks, worst-scoring file paths, score distribution. Developer reviews and decides action.

### Class grouping enforcement

- **D-09:** Enforcement via prompt rules only — no post-processing merge. Add explicit instructions: "A class and all its methods MUST be a single chunk. Never split a class across chunks."
- **D-10:** Large classes (100+ lines) may be split by the LLM into logical method groups. Prompt rule: "If a class exceeds 100 lines, split into logical method groups but always prefix each sub-chunk summary with the class name."
- **D-11:** Minimum chunk size remains 5+ lines (per PRMT-02).

### A/B prompt comparison UX

- **D-12:** Single CLI command: `ia-framework prompt compare v1 v2`. Full re-index with each prompt version, then runs benchmark on both.
- **D-13:** Results displayed as console table (query | MRR-v1 | MRR-v2 | delta) with color-coded deltas (green=improved, red=regressed) AND saved as a markdown report file.
- **D-14:** Comparison uses the benchmark corpus (same queries used for MRR baseline). No custom file subset.
- **D-15:** Each comparison requires full re-index with both prompt versions for accuracy — no shortcutting via existing indexed collections.

### Agent's Discretion

- Exact heuristic weights for quality score formula (how much each check contributes to the 0-100 score)
- Quality score threshold for "low quality" classification
- Exact prompt wording for class grouping rules and few-shot examples
- Default example file format in `.ia-framework/prompt-examples/`
- Markdown report file location and naming convention for A/B comparison output
- How prompt versions v1/v2 are resolved to actual prompt content during comparison

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prompt and chunking

- `packages/indexer/src/strategies/prompt.ts` — Current prompt template (zero examples, rules-only). Must add few-shot examples, class grouping rules, intent-focused summary guidance
- `packages/indexer/src/strategies/llm-strategy.ts` — LLM chunking strategy. Integration point for quality scoring after chunk generation
- `packages/indexer/src/strategies/llm-chunker.ts` — Core chunking module with windowing and stitching
- `packages/indexer/src/strategies/llm-cache.ts` — Cache key includes prompt version (Phase 19 D-09)

### Quality scoring

- `packages/indexer/src/strategies/chunk-validator.ts` — Existing chunk validation (gaps, overlaps, out-of-bounds). Quality scoring is a new concern alongside validation
- `packages/vector-store/src/qdrant.ts` — Where chunk metadata is stored on Qdrant points. Must add quality score field

### Benchmark and comparison

- `packages/benchmark/src/benchmark-runner.ts` — MRR calculation, core runner
- `packages/benchmark/src/benchmark-store.ts` — SQLite persistence for benchmark runs
- `packages/cli/src/commands/benchmark.command.ts` — CLI subcommands (run, list, compare). A/B comparison adds a new subcommand

### Prompt versioning (Phase 19)

- `packages/core/src/config/schema.ts` — Config schema with prompt version counter
- Phase 19 decisions D-08 through D-11 — Prompt versioning via `ia-framework prompt bump`, version in cache key

### Requirements

- `.planning/REQUIREMENTS.md` §PRMT-01 — Few-shot examples for boundary detection
- `.planning/REQUIREMENTS.md` §PRMT-02 — Class grouping rules and minimum chunk size
- `.planning/REQUIREMENTS.md` §PRMT-03 — Intent-focused summaries with domain terminology
- `.planning/REQUIREMENTS.md` §PRMT-04 — Heuristic quality score per summary
- `.planning/REQUIREMENTS.md` §PRMT-05 — CLI A/B comparison with MRR deltas

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `prompt.ts`: Current prompt template with `buildPrompt()` and `PROMPT_CONTENT_HASH` — extend with few-shot examples and class grouping rules
- `chunk-validator.ts`: Existing validation pattern (gaps, overlaps, out-of-bounds) — quality scoring follows same post-chunk analysis pattern
- `benchmark-runner.ts`: MRR computation — reuse for A/B comparison runs
- `benchmark.command.ts`: CLI subcommand pattern with Commander.js — add `prompt compare` subcommand

### Established Patterns

- Prompt content hash (`PROMPT_CONTENT_HASH`) auto-updates when prompt text changes — already supports version tracking
- CLI uses Commander.js subcommand pattern (`benchmark run`, `benchmark list`, `benchmark compare`)
- Qdrant points carry payload metadata — add `qualityScore` field alongside existing fields
- Config loaded from `.ia-framework/project.json` via cosmiconfig — extend for prompt examples path

### Integration Points

- `buildPrompt()` in prompt.ts — must load few-shot examples from config dir and inject into prompt
- `LlmChunkingStrategy` — must call quality scorer after generating chunks, before storing
- `QdrantVectorStore` — must accept and store quality score in point payload
- CLI `prompt` command group — add `compare` subcommand alongside existing `bump`
- Indexing pipeline — must pass quality scores through to end-of-run summary report

</code_context>

<specifics>
## Specific Ideas

- Few-shot examples should be developer-customizable via `.ia-framework/prompt-examples/` directory — framework ships defaults, devs override for their stack.
- Default examples in Java since that's the primary target project language.
- Quality scoring intentionally avoids LLM calls — heuristics only, to keep indexing fast.
- A/B comparison outputs both console (for quick review) and markdown file (for sharing/tracking).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 20-prompt-engineering_
_Context gathered: 2026-04-22_
