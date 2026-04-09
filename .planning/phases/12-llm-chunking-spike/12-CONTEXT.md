# Phase 12: LLM Chunking Spike - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Validate LLM chunking feasibility via Ollama before committing to full implementation. This is a GO/NO-GO gate for all LLM-dependent work in v1.1 (Phases 14-15). The spike is a standalone script that sends representative files to Ollama, measures latency/quality/determinism, and produces a documented decision with evidence. No pipeline integration — that's Phase 14.

</domain>

<decisions>
## Implementation Decisions

### Spike Output Structure

- **D-01:** LLM returns only semantic boundaries (startLine, endLine) and prose summaries. Do NOT ask the LLM to extract imports/exports — those come from AST anyway. Keeps the prompt focused on what LLMs are uniquely good at.
- **D-02:** Chunk boundaries are expressed as line-based: array of `{startLine, endLine, summary}` objects. Raw source code for each chunk is sliced from the original file using those line numbers.
- **D-03:** Prose summaries are 1-3 sentence paragraphs describing what the chunk does and why it matters. Replaces the mechanical `chunkToDescription()` output with richer semantic content for text embedding.
- **D-04:** Spike is a standalone script — validates JSON schema but does NOT integrate with the IndexingPipeline. Writes results to files for analysis.
- **D-05:** Spike writes structured JSON results + a human-readable markdown report. JSON for potential tooling, markdown for GO/NO-GO review.
- **D-06:** Spike includes side-by-side comparison of LLM chunk boundaries vs AST chunk boundaries for the same test files.
- **D-07:** Test files come from the configured target project (auto-discovered by size). Spike auto-selects representative small (~50 LOC), medium (~200 LOC), and large (~500+ LOC) files.

### GO/NO-GO Criteria

- **D-08:** Hard latency ceiling: 60 seconds per file maximum. Report must include per-file-size latency measurements.
- **D-09:** 100% valid JSON required. Every LLM response must parse as valid JSON. Use Ollama JSON mode to enforce this.
- **D-10:** Exact determinism required: same file must produce identical chunk boundaries (same startLine/endLine pairs) across all 5 runs with temperature=0. Any variation is a failure.
- **D-11:** Decision rule: 3 hard + 1 soft. Latency, JSON validity, and determinism MUST pass. Boundary quality (vs AST comparison) is informational — a "conditional GO" is acceptable if boundaries are merely comparable to AST.
- **D-12:** On NO-GO: one retry with a different model is allowed before final descope. If the retry also fails, LLM chunking phases (14-15) are descoped and milestone pivots.
- **D-13:** GO/NO-GO report lives in phase directory (`.planning/phases/12-llm-chunking-spike/`). Full evidence report: model tested, latency per file size (table), JSON validity rate, determinism results, boundary comparison (AST vs LLM side-by-side), final verdict with reasoning.
- **D-14:** Report includes projected indexing time for a full codebase (500-file and 2000-file estimates) based on measured per-file latency.

### Model & Prompt Approach

- **D-15:** Single best candidate model — researcher picks the best code-specialized model (e.g., qwen2.5-coder, deepseek-coder) in the 14B-32B parameter range. If it fails, the retry uses a different model.
- **D-16:** Use Ollama's native JSON mode (`format: 'json'` in the API call) for structured output. Enforces valid JSON at the model level.
- **D-17:** Code-specialized model preferred over general-purpose. Better at understanding code structure and identifying semantic boundaries.
- **D-18:** Use the Ollama generate API (`/api/generate`) with `format: 'json'`. Single request/response per file.
- **D-19:** Strict sampling: `temperature=0` only. No experimentation with other sampling parameters. Matches determinism requirement.
- **D-20:** Source code presented to LLM with line numbers prepended (e.g., `1: import foo...\n2: export function bar...`). LLM returns startLine/endLine that map directly to these numbers.
- **D-21:** Model size range: 14B-32B parameters. Balanced between quality and latency within the 60s/file budget.

### Large File Handling

- **D-22:** Pre-split large files into overlapping windows before sending to LLM. Each window processed independently, results stitched together afterward.
- **D-23:** Window size: 90% of the model's reported context window for source code, 10% reserved for prompt template and JSON response. This ratio is configurable.
- **D-24:** Overlap between windows is configurable (default value to be determined by spike experimentation).
- **D-25:** Stitching strategy: line-range merge + dedup. If two windows produce chunks that overlap in line numbers, merge them. Dedup prose summaries by taking the one from the window with more context.

### Agent's Discretion

- Exact prompt template wording — researcher and planner can iterate on this
- Default overlap line count for large file windows
- Choice of specific model within the 14B-32B code-specialized range
- Token estimation approach (existing 4 chars/token or model-specific)
- File size thresholds for small/medium/large classification
- Number of test files per size category

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing chunking pipeline

- `packages/ast-parser/src/types.ts` — CodeChunk interface that LLM output will be compared against
- `packages/ast-parser/src/chunker.ts` — Current AST chunking flow (parseFile → language parser → splitOversizedChunks)
- `packages/indexer/src/chunk-description.ts` — Current chunkToDescription() that LLM prose summaries will replace

### Ollama integration

- `packages/embedding/src/providers/ollama.ts` — Existing Ollama HTTP client pattern (base URL, error handling, fetch API)
- `packages/core/src/config/schema.ts` — ProjectConfigSchema with embedding provider config (model, baseUrl, dimensions)

### Pipeline context

- `packages/indexer/src/pipeline.ts` — IndexingPipeline flow (walk → parse → embed → store). Spike does NOT integrate but must understand what Phase 14 will need.

### Requirements

- `.planning/REQUIREMENTS.md` §INDX-13 — Spike requirement definition
- `.planning/ROADMAP.md` §Phase 12 — Success criteria (SC-1 through SC-4)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `OllamaEmbeddingProvider` (`packages/embedding/src/providers/ollama.ts`): HTTP client pattern for Ollama at `http://localhost:11434`. Spike can reuse the fetch + error handling pattern for `/api/generate`.
- `chunkToDescription()` (`packages/indexer/src/chunk-description.ts`): Current prose generation from AST metadata. LLM prose summaries should be evaluated as a quality improvement over this.
- `parseFile()` (`packages/ast-parser/src/chunker.ts`): Can be called directly to generate AST chunks for the side-by-side comparison.
- `walkFiles()` (`packages/indexer/src/file-walker.ts`): Can be used for auto-discovering test files from the target project.
- `loadConfig()` (`packages/core/src/config/loader.ts`): Loads project.json to get target project path and Ollama base URL.

### Established Patterns

- All Ollama communication uses native `fetch()` with JSON request/response
- Embedding provider uses `baseUrl ?? 'http://localhost:11434'` default
- Token estimation: `Math.ceil(text.length / 4)` for rough estimate
- File paths: absolute `filePath` + relative `relativePath` from project root
- Chunk IDs: SHA1 hash of `filePath:startLine:endLine`

### Integration Points

- Spike is standalone — no integration needed for this phase
- Phase 14 will need to produce `CodeChunk`-compatible output and feed into `IndexingPipeline`
- The `ContextSource` interface in `@ia-framework/core` could potentially be used for LLM chunks, but that's a Phase 14 decision

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for spike implementation. Key constraint is that the spike must use the target project's actual files (not ia-framework's own source or synthetic files) to validate against real-world code.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 12-llm-chunking-spike_
_Context gathered: 2026-04-09_
