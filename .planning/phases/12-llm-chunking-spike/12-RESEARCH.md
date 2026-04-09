# Phase 12: LLM Chunking Spike — Research

**Date:** 2026-04-09
**Phase:** 12-llm-chunking-spike
**Requirement:** INDX-13

## Research Summary

Investigated Ollama's generate API, structured output capabilities, code-specialized models in the 14B-32B range, and context window handling for the LLM chunking spike.

## Ollama /api/generate — Key Facts

### Endpoint

`POST /api/generate` with `stream: false` for single complete response.

### Structured Output

Two modes for enforcing JSON output:

1. **`format: 'json'`** — Free-form JSON, model decides structure
2. **`format: { type: 'object', properties: { ... } }`** — Full JSON schema enforcement. Model MUST conform to the schema.

**Recommendation:** Use full JSON schema mode (option 2) per D-09 (100% valid JSON required). This guarantees the response matches our expected `{ chunks: [{ startLine, endLine, summary }] }` structure at the model level.

### Response Metrics (Built-in Latency Data)

Every `/api/generate` response includes:

```json
{
  "total_duration": 174560334, // Total time (nanoseconds)
  "load_duration": 101397084, // Model load time (nanoseconds)
  "prompt_eval_count": 11, // Input tokens consumed
  "prompt_eval_duration": 13074791, // Prompt processing time (ns)
  "eval_count": 18, // Output tokens generated
  "eval_duration": 52479709 // Generation time (nanoseconds)
}
```

**Key insight:** No need to implement custom timing — Ollama provides nanosecond-precision metrics per request. We compute:

- `latency = total_duration / 1e9` (seconds)
- `tokens_per_sec = eval_count / (eval_duration / 1e9)`
- `prompt_tokens = prompt_eval_count`
- `output_tokens = eval_count`

### Determinism Parameters

```typescript
{
  options: {
    temperature: 0,   // Per D-19: strict, no randomness
    seed: 42,         // Fixed seed for additional reproducibility
    num_ctx: N,       // Context window size (model-dependent)
  }
}
```

### Context Window Configuration

- `options.num_ctx` sets the context window size in tokens
- Default varies by model (often 2048 or 4096 for speed)
- Must set explicitly to use full model capacity
- `qwen2.5-coder:14b` supports up to 128K context but defaults much lower

### Model Info

`POST /api/show` with `{ name: "model:tag" }` returns model details including parameter count, context length, and supported features. Use this to query the model's maximum context window.

## Model Recommendation

### Primary: `qwen2.5-coder:14b`

- **Parameters:** 14.7B
- **Context window:** 32,768 tokens (configurable, supports up to 128K)
- **Specialization:** Code-specialized (Qwen2.5-Coder family)
- **JSON mode:** Fully supported
- **Why:** Best balance of code understanding, speed, and quality in the 14B range. The Qwen2.5-Coder family is consistently top-ranked for code tasks. 14B fits comfortably in 16GB+ VRAM.

### Retry: `qwen2.5-coder:32b`

- **Parameters:** 32.5B
- **Context window:** 32,768 tokens (configurable, supports up to 128K)
- **Why:** If 14B fails quality or determinism checks, 32B provides significantly better reasoning at the cost of ~2x latency. Requires 24GB+ VRAM.

### Context Window Strategy

Per D-23: Reserve 90% of context for source code, 10% for prompt template + JSON response.

For practical spike purposes, set `num_ctx: 32768` (32K tokens). This gives:

- ~29,400 tokens for source code (~117,600 chars at 4 chars/token)
- ~3,300 tokens for prompt + response
- A ~200-line file is typically ~5,000-8,000 chars (~1,250-2,000 tokens) — fits easily
- A ~500-line file is typically ~15,000-25,000 chars (~3,750-6,250 tokens) — fits easily
- Large files (1000+ lines) may need windowing

## Prompt Design

### Strategy

Present source code with line numbers prepended (per D-20). Ask the model to identify semantic boundaries and produce prose summaries. Use JSON schema enforcement to guarantee output structure.

### JSON Schema for Output

```json
{
  "type": "object",
  "properties": {
    "chunks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "startLine": { "type": "integer" },
          "endLine": { "type": "integer" },
          "summary": { "type": "string" }
        },
        "required": ["startLine", "endLine", "summary"]
      }
    }
  },
  "required": ["chunks"]
}
```

### Prompt Template (Draft)

```
You are a code analysis tool. Analyze the following source code and identify semantic boundaries — groups of lines that form a cohesive unit of functionality.

For each semantic chunk, provide:
- startLine: the first line number of the chunk
- endLine: the last line number of the chunk
- summary: a 1-3 sentence description of what this chunk does and why it matters

Rules:
- Every line of the file MUST be covered by exactly one chunk (no gaps, no overlaps)
- Chunk boundaries should align with semantic units (functions, classes, logical blocks)
- Import/export blocks should be their own chunk
- Summaries should describe the PURPOSE and BEHAVIOR, not just list identifiers

Source code:
```

## Large File Windowing

### Algorithm

Per D-22/D-23/D-24/D-25:

1. **Estimate tokens:** `Math.ceil(fileContent.length / 4)` (existing pattern)
2. **If tokens < 90% of num_ctx:** Process as single request
3. **If tokens >= 90% of num_ctx:** Split into overlapping windows
4. **Window size:** `Math.floor(num_ctx * 0.9)` tokens → `windowSize * 4` chars
5. **Split by line boundaries** (don't split mid-line)
6. **Overlap:** Start with 20 lines overlap (configurable, measure during spike)
7. **Stitch:** Merge chunks from adjacent windows by line-range dedup

### Stitching Strategy (D-25)

When two windows produce chunks that overlap in line numbers:

1. If chunk A from window 1 has `endLine >= chunk B's startLine` from window 2
2. Merge: take `min(startLine)` to `max(endLine)`
3. For summary: use the one from the window that had more surrounding context (typically the window where the chunk is fully contained)

## Spike Script Architecture

### File Structure

```
spike/llm-chunking/
├── package.json          # Minimal: tsx, @ia-framework/ast-parser, @ia-framework/core
├── tsconfig.json         # Extends root, target ESNext
├── src/
│   ├── ollama-client.ts  # Ollama /api/generate + /api/show wrapper
│   ├── prompt.ts         # Prompt template + JSON schema
│   ├── file-selector.ts  # Auto-discover small/medium/large files from target project
│   ├── chunker.ts        # chunkFile() with windowing support
│   ├── measurement.ts    # Latency tracking, determinism comparison
│   ├── ast-comparison.ts # Side-by-side AST vs LLM chunk boundary comparison
│   ├── report.ts         # JSON + markdown report generator
│   └── run-spike.ts      # Main entry point
└── results/              # Generated during spike run (gitignored)
```

### Dependencies

- `tsx` — Run TypeScript directly (already in root devDeps)
- `@ia-framework/ast-parser` — For AST comparison (parseFile)
- `@ia-framework/core` — For loadConfig (target project path, Ollama base URL)
- No new external dependencies needed

### File Size Categories (D-07)

Auto-discover from target project, categorized by line count:

- **Small:** ~50 LOC (30-80 lines)
- **Medium:** ~200 LOC (150-300 lines)
- **Large:** ~500+ LOC (400+ lines)

Select 2-3 files per category for comprehensive testing.

## Validation Architecture

### Test Matrix

| Dimension     | Method                                             | Pass Criteria                                      |
| ------------- | -------------------------------------------------- | -------------------------------------------------- |
| JSON validity | Parse response with JSON.parse + schema validation | 100% parse rate (D-09)                             |
| Latency       | Ollama response metrics (total_duration)           | < 60s per file (D-08)                              |
| Determinism   | 5 runs same file, compare boundaries               | Identical startLine/endLine across all runs (D-10) |
| Coverage      | Sum chunk line ranges vs file line count           | Every line covered, no gaps                        |
| Quality       | AST comparison side-by-side                        | Informational — not hard gate (D-11)               |

### GO/NO-GO Decision Matrix (D-11)

| Criterion                | Type | Weight        |
| ------------------------ | ---- | ------------- |
| Latency ≤ 60s/file       | Hard | MUST pass     |
| 100% valid JSON          | Hard | MUST pass     |
| Deterministic boundaries | Hard | MUST pass     |
| Boundary quality vs AST  | Soft | Informational |

**Result:** GO if all 3 hard criteria pass. Conditional GO acceptable if boundary quality is merely comparable to AST.

## Sources

- Ollama API docs: https://docs.ollama.com/api/generate
- Ollama structured outputs: https://docs.ollama.com/capabilities/structured-outputs
- Context7 /websites/ollama_api (HIGH reputation, 113 snippets)
- Context7 /llmstxt/ollama_llms_txt (HIGH reputation, 483 snippets)

---

_Research completed: 2026-04-09_
_Phase: 12-llm-chunking-spike_
