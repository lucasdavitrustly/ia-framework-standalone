# Phase 12: LLM Chunking Spike - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 12-llm-chunking-spike
**Areas discussed:** Spike output structure, GO/NO-GO criteria, Model & prompt approach, Large file handling

---

## Spike Output Structure

| Option                     | Description                                                   | Selected |
| -------------------------- | ------------------------------------------------------------- | -------- |
| Mirror CodeChunk + summary | LLM returns JSON matching CodeChunk fields plus prose summary |          |
| Boundaries + prose only    | LLM returns only semantic boundaries and prose summaries      | ✓        |
| You decide                 | Agent discretion                                              |          |

**User's choice:** Boundaries + prose only
**Notes:** Keep LLM focused on what it's uniquely good at — semantic understanding. Structural extraction stays with AST.

---

| Option                   | Description                                    | Selected |
| ------------------------ | ---------------------------------------------- | -------- |
| Line-based boundaries    | Array of {startLine, endLine, summary} objects | ✓        |
| Name-based references    | Match by function/class names                  |          |
| Full content in response | LLM returns actual code text                   |          |

**User's choice:** Line-based boundaries
**Notes:** Source code sliced from original file using reported line numbers.

---

| Option           | Description              | Selected |
| ---------------- | ------------------------ | -------- |
| Prose paragraph  | 1-3 sentence paragraph   | ✓        |
| Short label only | Brief label              |          |
| Label + prose    | Both label and paragraph |          |

**User's choice:** Prose paragraph

---

| Option                     | Description                           | Selected |
| -------------------------- | ------------------------------------- | -------- |
| Standalone script          | No pipeline integration               | ✓        |
| Pipeline-compatible output | Produces CodeChunk-compatible objects |          |

**User's choice:** Standalone script

---

| Option                 | Description                                | Selected |
| ---------------------- | ------------------------------------------ | -------- |
| JSON + markdown report | Structured results + human-readable report | ✓        |
| Console output only    | Results to stdout                          |          |
| SQLite storage         | Persist alongside benchmark data           |          |

**User's choice:** JSON + markdown report

---

| Option                    | Description                         | Selected |
| ------------------------- | ----------------------------------- | -------- |
| Yes, side-by-side         | Compare LLM vs AST chunk boundaries | ✓        |
| No, standalone evaluation | Evaluate LLM on its own             |          |

**User's choice:** Yes, side-by-side comparison

---

| Option                    | Description                         | Selected |
| ------------------------- | ----------------------------------- | -------- |
| ia-framework source files | Use this project's own code         |          |
| Target project files      | Use configured target project       | ✓        |
| Synthetic test files      | Curated files with known properties |          |

**User's choice:** Target project files

---

| Option                    | Description                                     | Selected |
| ------------------------- | ----------------------------------------------- | -------- |
| Auto-discover from target | Pick representative files by size automatically | ✓        |
| User-specified paths      | Let user specify via CLI args                   |          |
| Auto-discover + override  | Both                                            |          |

**User's choice:** Auto-discover from target

---

## GO/NO-GO Criteria

| Option               | Description              | Selected |
| -------------------- | ------------------------ | -------- |
| Hard latency ceiling | Per-file max time limit  | ✓        |
| Throughput floor     | Tokens/second minimum    |          |
| Batch-reasonable     | Loose timing requirement |          |

**User's choice:** Hard latency ceiling

---

| Option      | Description            | Selected |
| ----------- | ---------------------- | -------- |
| 30 sec/file | ~4 hours for 500 files |          |
| 60 sec/file | ~8 hours for 500 files | ✓        |
| 10 sec/file | Interactive-fast       |          |

**User's choice:** 60 sec/file

---

| Option                 | Description                    | Selected |
| ---------------------- | ------------------------------ | -------- |
| 90% valid JSON         | Occasional failures acceptable |          |
| 100% valid JSON        | Must be reliable               | ✓        |
| Feasibility proof only | Just prove it can work         |          |

**User's choice:** 100% valid JSON

---

| Option                           | Description                        | Selected |
| -------------------------------- | ---------------------------------- | -------- |
| Exact match required             | Identical boundaries across 5 runs | ✓        |
| Near-match (±2 lines)            | Minor variation allowed            |          |
| Boundaries exact, prose flexible | Boundaries strict, prose can vary  |          |

**User's choice:** Exact match required

---

| Option            | Description                                 | Selected |
| ----------------- | ------------------------------------------- | -------- |
| All 4 must pass   | Every criterion mandatory                   |          |
| 3 hard + 1 soft   | Latency/JSON/determinism hard, quality soft | ✓        |
| 3 of 4 sufficient | Any 3 passing is GO                         |          |

**User's choice:** 3 hard + 1 soft

---

| Option                         | Description                     | Selected |
| ------------------------------ | ------------------------------- | -------- |
| Descope LLM phases, pivot      | Full descope on failure         |          |
| One retry with different model | Second chance before descope    | ✓        |
| Partial GO (size-limited)      | LLM for small/medium files only |          |

**User's choice:** One retry with different model before final descope

---

| Option                 | Description             | Selected |
| ---------------------- | ----------------------- | -------- |
| Phase directory report | .planning/phases/12-\*/ | ✓        |
| Project root doc       | Root-level visibility   |          |

**User's choice:** Phase directory report

---

| Option               | Description                            | Selected |
| -------------------- | -------------------------------------- | -------- |
| Full evidence report | Comprehensive with tables and evidence | ✓        |
| Summary + raw data   | Minimal summary, details in JSON       |          |

**User's choice:** Full evidence report

---

| Option              | Description                      | Selected |
| ------------------- | -------------------------------- | -------- |
| Include projections | 500-file and 2000-file estimates | ✓        |
| Skip, per-file only | Just per-file metrics            |          |

**User's choice:** Include projections

---

## Model & Prompt Approach

| Option                 | Description                | Selected |
| ---------------------- | -------------------------- | -------- |
| Single best candidate  | Researcher picks one model | ✓        |
| Multi-model comparison | Test 2-3 models            |          |
| Researcher decides     | Defer to research phase    |          |

**User's choice:** Single best candidate

---

| Option                    | Description                | Selected |
| ------------------------- | -------------------------- | -------- |
| Ollama JSON mode          | format: 'json' in API call | ✓        |
| Prompt-based JSON         | Prompt engineering only    |          |
| Schema-constrained output | JSON schema constraint     |          |

**User's choice:** Ollama JSON mode

---

| Option           | Description                         | Selected |
| ---------------- | ----------------------------------- | -------- |
| Code-specialized | e.g., qwen2.5-coder, deepseek-coder | ✓        |
| General-purpose  | e.g., llama3, mistral               |          |
| Researcher picks | Defer to research                   |          |

**User's choice:** Code-specialized

---

| Option             | Description                           | Selected |
| ------------------ | ------------------------------------- | -------- |
| Generate API       | /api/generate with format:'json'      | ✓        |
| Chat API           | /api/chat with system + user messages |          |
| Researcher decides | Defer to research                     |          |

**User's choice:** Generate API (/api/generate)

---

| Option                       | Description         | Selected |
| ---------------------------- | ------------------- | -------- |
| 7B                           | Fast, lower quality |          |
| 14B-32B                      | Balanced            | ✓        |
| Whatever fits latency budget | No size constraint  |          |

**User's choice:** 14B-32B parameter range

---

| Option                 | Description                    | Selected |
| ---------------------- | ------------------------------ | -------- |
| Line-numbered source   | Prepend line numbers to source | ✓        |
| Raw source, LLM counts | LLM counts lines itself        |          |
| AST-pre-marked source  | AST marks boundaries in source |          |

**User's choice:** Line-numbered source

---

| Option             | Description           | Selected |
| ------------------ | --------------------- | -------- |
| temperature=0 only | Strict, deterministic | ✓        |
| 0 + 0.1 comparison | Test both             |          |
| Researcher decides | Defer                 |          |

**User's choice:** temperature=0 only

---

## Large File Handling

| Option                         | Description                 | Selected |
| ------------------------------ | --------------------------- | -------- |
| Send full, measure degradation | Test what happens at limits |          |
| Pre-split with overlap         | Window-based processing     | ✓        |
| Skip oversized files           | Mark as unsupported         |          |

**User's choice:** Pre-split with overlap

---

| Option                      | Description        | Selected |
| --------------------------- | ------------------ | -------- |
| 75% context / 25% overhead  | Conservative split |          |
| Fixed line count per window | Simple fixed size  |          |
| Researcher decides          | Defer              |          |

**User's choice:** 90% context / 10% overhead (custom answer — also specified this should be configurable)

---

| Option                 | Description                        | Selected |
| ---------------------- | ---------------------------------- | -------- |
| 50-line overlap        | Fixed 50 lines                     |          |
| AST-aware split points | Split at function/class boundaries |          |
| Configurable overlap   | Default with override              | ✓        |

**User's choice:** Configurable overlap

---

| Option                   | Description                           | Selected |
| ------------------------ | ------------------------------------- | -------- |
| Line-range merge + dedup | Merge overlapping chunks, dedup prose | ✓        |
| Concatenate, dedup later | Simple concat                         |          |
| Researcher decides       | Defer                                 |          |

**User's choice:** Line-range merge + dedup

---

## Agent's Discretion

- Exact prompt template wording
- Default overlap line count for large file windows
- Choice of specific model within the 14B-32B code-specialized range
- Token estimation approach
- File size thresholds for small/medium/large classification
- Number of test files per size category

## Deferred Ideas

None — discussion stayed within phase scope.
