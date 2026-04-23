# Phase 20: Prompt Engineering - Research

**Date:** 2026-04-23
**Status:** Complete

## Validation Architecture

### Key Behaviors to Validate

1. **Few-shot examples loaded and injected** — `buildPrompt()` includes example blocks from config dir
2. **Class grouping rules present** — prompt contains explicit class-method grouping instructions
3. **Intent-focused summaries** — prompt instructs domain terminology over syntax descriptions
4. **Quality scoring** — each chunk gets a 0-100 heuristic score stored in Qdrant payload
5. **A/B comparison** — `ia-framework prompt compare v1 v2` produces side-by-side MRR deltas

### Automated Verification

- Unit tests for quality scorer heuristics (input/output pairs)
- Unit tests for prompt builder with/without custom examples
- Integration test for `prompt compare` CLI subcommand
- Verify `ChunkPayload` includes `qualityScore` field

## Technical Analysis

### 1. Prompt Enhancement (PRMT-01, PRMT-02, PRMT-03)

**Current state:** `prompt.ts` has a simple `buildPrompt(sourceCode, fileName)` that builds a static prompt with rules. No few-shot examples, no class grouping rules, no intent-focused guidance.

**Approach:**

- Extend `buildPrompt()` to accept optional few-shot examples parameter
- Load examples from `.ia-framework/prompt-examples/` directory at runtime (per D-03)
- Ship default Java examples in framework source, copy to config dir on init (per D-02, D-04)
- Add class grouping rules directly to prompt text (per D-09, D-10, D-11)
- Add intent-focused summary guidance to prompt text (per PRMT-03)
- `PROMPT_CONTENT_HASH` auto-updates since it hashes the prompt template

**Example file format:** Markdown files with `good.md` and `bad.md` showing boundary examples. Simple text format loaded at runtime.

**Impact on cache:** `PROMPT_CONTENT_HASH` changes → cache key changes → all files re-processed on next index. This is correct behavior per Phase 19 versioning.

### 2. Quality Scoring (PRMT-04)

**Current state:** No quality scoring exists. `chunk-validator.ts` handles structural validation (gaps/overlaps/out-of-bounds) but not semantic quality.

**Approach:**

- New `quality-scorer.ts` in `packages/indexer/src/strategies/`
- Heuristic checks (per D-05):
  - Minimum summary length (e.g., 20 chars)
  - No raw code tokens (camelCase/snake_case identifiers above threshold)
  - Presence of purpose verbs (handles, validates, orchestrates, manages, etc.)
  - Not just listing identifiers
- Score: 0-100 numeric (per D-06), weighted sum of checks
- Integration: called in `LlmChunkingStrategy.chunk()` after generating chunks, before returning
- Storage: add `qualityScore` field to `ChunkPayload` interface → stored in Qdrant point payload (per D-07)
- Reporting: end-of-run summary showing count of low-quality chunks, worst files, distribution (per D-08)

### 3. A/B Prompt Comparison (PRMT-05)

**Current state:** `prompt.command.ts` has only `bump` subcommand. `benchmark.command.ts` has `compare` for comparing two existing run IDs.

**Approach per D-12 through D-15:**

- New CLI: `ia-framework prompt compare v1 v2` — where v1/v2 are prompt version numbers
- Flow: For each version → set promptVersion in config → full re-index → run benchmark → collect results
- Display: console table (query | MRR-v1 | MRR-v2 | delta) with color-coded deltas (per D-13)
- Also save markdown report file (per D-13)
- Uses existing benchmark corpus (per D-14)
- Full re-index required for each version (per D-15)

**Prompt version resolution:** v1/v2 map to `promptVersion` in project.json. The prompt content itself doesn't change between versions unless the developer modifies prompt.ts. The comparison tests the effect of prompt changes by:

1. Setting promptVersion=v1 → index (uses cache or re-processes) → benchmark
2. Setting promptVersion=v2 → index (forces re-process due to different version) → benchmark
3. Compare results

This requires programmatic access to the indexing pipeline and benchmark runner from within the CLI command.

### Integration Points

| Component                     | Change                                     | Risk                                      |
| ----------------------------- | ------------------------------------------ | ----------------------------------------- |
| `prompt.ts`                   | Add examples, rules, guidance              | Low — additive to existing prompt         |
| `ChunkPayload` (interface.ts) | Add `qualityScore?: number`                | Low — optional field, backward compatible |
| `llm-strategy.ts`             | Call quality scorer after chunking         | Low — post-processing step                |
| `qdrant.ts`                   | No change needed — payload is spread as-is | None                                      |
| `prompt.command.ts`           | Add `compare` subcommand                   | Low — new command                         |
| `benchmark-runner.ts`         | Reuse existing `run()` method              | None                                      |

### Dependencies

- Plan 01 (prompt enhancement) and Plan 02 (quality scoring) are independent → Wave 1
- Plan 03 (A/B comparison) depends on both → Wave 2 (needs enhanced prompt to compare versions meaningfully, and quality scores for richer comparison)

## Sources

- Direct codebase analysis of packages/indexer/src/strategies/\*.ts
- Direct codebase analysis of packages/cli/src/commands/prompt.command.ts
- Direct codebase analysis of packages/cli/src/commands/benchmark.command.ts
- Direct codebase analysis of packages/vector-store/src/interface.ts
