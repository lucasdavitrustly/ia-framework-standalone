# Phase 27: Benchmark Executor Model Lock Enforcement - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add model identity validation to the benchmark executor. After each prompt execution, parse the `LLM-IDENTITY` block from the response and assert that `Model` matches the configured model. Flag `model_mismatch: true` in output for deviating prompts. Optional `--strict-model` CLI flag aborts on first mismatch.

Package: packages/benchmark

</domain>

<decisions>
## Implementation Decisions

### Problem Statement (from benchmark run 2026-04-24)

Prompts 3 and 4 executed on Claude Sonnet 4.6 instead of the configured GPT 5.4 model. This introduced a model identity inconsistency that reduces benchmark data reliability. The runner had no mechanism to detect or flag this.

### Impact of the Bug

- Prompts 3 and 4 scores are confounded by model capability differences, not RAG quality differences
- The benchmark comparison (WITH vs WITHOUT MCP) is unreliable for those two prompts
- Without enforcement, future benchmark runs may silently produce mixed-model data

### Expected Impact

Improves benchmark data quality and reproducibility. Eliminates model inconsistency as a confounding variable. Future benchmark consumers can trust that all prompts in a run used the same model.

### Design Decisions

- **D-01:** `LLM-IDENTITY` block is a structured footer the benchmark executor requests each LLM to include in its response. Format:
  ```
  ---LLM-IDENTITY---
  Model: <model-id>
  Provider: <provider>
  Temperature: <value>
  ---END-IDENTITY---
  ```
- **D-02:** Executor parses this block from the raw response text using a regex. If block is absent, log `identity_missing: true` (not a hard failure — some models may not comply).
- **D-03:** Comparison: parsed `Model` field (case-insensitive, partial match allowed) vs `config.model`. Mismatch → `model_mismatch: true` on the individual prompt result.
- **D-04:** Run-level integrity: if any prompt has `model_mismatch: true`, the run is marked `run_integrity: "partial"`. If all prompts are clean, `run_integrity: "full"`.
- **D-05:** `--strict-model` CLI flag: abort run on first mismatch, exit with non-zero code. Useful for CI pipelines where mixed-model data is unacceptable.
- **D-06:** Retroactive analysis: `ia-framework benchmark validate-models <run-id>` re-parses stored raw responses and computes `model_mismatch` flags without re-running. Useful for auditing historical runs including the 2026-04-24 anomaly.
- **D-07:** The `LLM-IDENTITY` block request is injected into the system prompt for every benchmark prompt execution — not a separate API call.

### Agent's Discretion

- Regex pattern for parsing the IDENTITY block (handle whitespace variants, optional fields)
- SQLite column additions for `model_mismatch`, `identity_missing`, `run_integrity`
- Whether `validate-models` is a subcommand of `benchmark` or a top-level CLI command (suggest: `ia-framework benchmark validate-models <run-id>`)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Benchmark executor

- `packages/benchmark/src/benchmark-runner.ts` — Where prompt execution happens; add identity parsing here
- `packages/benchmark/src/types.ts` — `BenchmarkPromptResult` type; add `modelMismatch`, `identityMissing` fields
- `packages/benchmark/src/benchmark-store.ts` — SQLite schema; add `model_mismatch` and `run_integrity` columns
- `packages/cli/src/commands/benchmark.command.ts` — CLI; add `--strict-model` flag and `validate-models` subcommand

### LLM-IDENTITY block convention

- The `LLM-IDENTITY` block format is already referenced in the RAG benchmark skill (`.opencode/skills/rag-benchmark/SKILL.md`) — consult for exact format spec
- `packages/benchmark/src/prompts/` — System prompt templates where IDENTITY request injection goes

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `benchmark-runner.ts`: Already captures raw LLM response text — parsing the IDENTITY block requires no new API calls
- `benchmark-store.ts`: SQLite `benchmark_runs` table already has a `config` JSON column — add `run_integrity` to run-level schema
- Commander CLI subcommand pattern: `validate-models` follows the same pattern as existing `benchmark compare`

### Integration Points

- `BenchmarkRunner.runPrompt()`: After receiving response, call `parseIdentityBlock(responseText)`, compare with `config.model`, attach to result
- `BenchmarkStore.saveRun()`: Persist `model_mismatch` per prompt and aggregate `run_integrity` at run level
- CLI `--strict-model`: Pass flag through `BenchmarkConfig` to runner; runner throws on first mismatch when enabled

</code_context>

<specifics>
## Specific Ideas

- The 2026-04-24 run where prompts 3 & 4 used Claude Sonnet 4.6 should become a test fixture: `validate-models` on that run ID must detect exactly 2 mismatched prompts.
- Surface `run_integrity` as a badge on the dashboard benchmark history page: "Full" (green), "Partial" (yellow), "Unknown" (grey for old runs without the field).

</specifics>

<deferred>
## Deferred Ideas

- Automatic model correction (retry the prompt with the correct model on mismatch) — deferred; adds cost and complexity. Flag-and-report is sufficient for v1.3.
- Provider-level identity verification (verify API key corresponds to claimed provider) — out of scope.

</deferred>

---

_Phase: 27-benchmark-model-lock-enforcement_
_Context gathered: 2026-04-24_
_Source: 2026-04-24 benchmark run — prompts 3 & 4 model identity inconsistency_
