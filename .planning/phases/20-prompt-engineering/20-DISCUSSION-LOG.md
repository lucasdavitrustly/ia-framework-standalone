# Phase 20: Prompt Engineering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 20-prompt-engineering
**Areas discussed:** Few-shot example design, Summary quality criteria, Class grouping enforcement, A/B prompt comparison UX

---

## Few-shot Example Design

| Option                   | Description                                                    | Selected |
| ------------------------ | -------------------------------------------------------------- | -------- |
| Inline examples          | 2-3 short inline examples embedded directly in prompt template | ✓        |
| External example library | Examples loaded from separate files, selected by language      |          |
| Good-only examples       | Only show good examples, skip bad examples                     |          |

**User's choice:** Inline examples
**Notes:** None

| Option              | Description                   | Selected |
| ------------------- | ----------------------------- | -------- |
| TypeScript only     | Matches primary use case      |          |
| TypeScript + Python | Covers two supported grammars |          |
| Language-agnostic   | Pseudo-code examples          |          |

**User's choice:** Java, but the dev can change or add more examples from other languages
**Notes:** User specified Java as default language, with customizability for other languages.

| Option         | Description                            | Selected |
| -------------- | -------------------------------------- | -------- |
| 1 good + 1 bad | Minimal token cost, clear contrast     | ✓        |
| 2 good + 1 bad | More reinforcement, moderate cost      |          |
| 2 good + 2 bad | Thorough coverage, higher token budget |          |

**User's choice:** 1 good + 1 bad

| Option                   | Description                          | Selected |
| ------------------------ | ------------------------------------ | -------- |
| Editable in source       | Hardcoded in prompt.ts with comments |          |
| Config-driven at runtime | Loaded from config directory         | ✓        |

**User's choice:** Config-driven at runtime
**Notes:** Examples loaded from `.ia-framework/prompt-examples/` directory.

---

## Summary Quality Criteria

| Option            | Description                                            | Selected |
| ----------------- | ------------------------------------------------------ | -------- |
| Heuristic rules   | Min length, no raw tokens, purpose verbs. No LLM call. | ✓        |
| LLM-based scoring | Second LLM call to score 1-5. Doubles latency.         |          |
| Hybrid approach   | Heuristics + LLM for borderline cases                  |          |

**User's choice:** Heuristic rules

| Option              | Description                        | Selected |
| ------------------- | ---------------------------------- | -------- |
| Numeric 0-100       | Weighted checks, easy to threshold | ✓        |
| Categorical         | good/acceptable/poor               |          |
| Per-check pass/fail | Boolean per check with pass rate   |          |

**User's choice:** Numeric 0-100

| Option                | Description                     | Selected |
| --------------------- | ------------------------------- | -------- |
| Qdrant point metadata | Stored on chunk, queryable      | ✓        |
| Report-only           | Logged, not persisted           |          |
| SQLite metrics store  | Stored alongside benchmark data |          |

**User's choice:** Qdrant point metadata

| Option             | Description                             | Selected |
| ------------------ | --------------------------------------- | -------- |
| End-of-run summary | Count + worst scores at end of indexing | ✓        |
| Per-chunk warnings | Real-time warnings during indexing      |          |
| Silent storage     | Scores stored, no output unless queried |          |

**User's choice:** End-of-run summary

---

## Class Grouping Enforcement

| Option                   | Description                                         | Selected |
| ------------------------ | --------------------------------------------------- | -------- |
| Prompt rules only        | Explicit instructions in prompt, no post-processing | ✓        |
| Post-processing merge    | Detect class boundaries, merge split chunks         |          |
| Prompt + post-processing | Both as safety net                                  |          |

**User's choice:** Prompt rules only

| Option              | Description                                  | Selected |
| ------------------- | -------------------------------------------- | -------- |
| Always single chunk | Class stays together regardless of size      |          |
| Split large classes | Split at threshold with class name reference | ✓        |
| You decide          | Agent's discretion                           |          |

**User's choice:** Split large classes

| Option                   | Description                                                   | Selected |
| ------------------------ | ------------------------------------------------------------- | -------- |
| LLM decides split points | Prompt rule for logical method groups, prefix with class name | ✓        |
| Fixed line splits        | Split at every N lines                                        |          |
| You decide               | Agent's discretion                                            |          |

**User's choice:** LLM decides split points

---

## A/B Prompt Comparison UX

| Option                 | Description                         | Selected |
| ---------------------- | ----------------------------------- | -------- |
| Single command         | `ia-framework prompt compare v1 v2` | ✓        |
| Separate run + compare | Two-step: run then compare          |          |
| You decide             | Agent's discretion                  |          |

**User's choice:** Single command

| Option          | Description                   | Selected |
| --------------- | ----------------------------- | -------- |
| Console table   | Color-coded MRR deltas        |          |
| Markdown report | Written to file               |          |
| Console + file  | Both console and saved report | ✓        |

**User's choice:** Console + file

| Option               | Description                               | Selected |
| -------------------- | ----------------------------------------- | -------- |
| Full re-index        | Re-index with each version, most accurate | ✓        |
| Use existing indexes | Skip re-indexing if collections exist     |          |

**User's choice:** Full re-index

| Option             | Description                            | Selected |
| ------------------ | -------------------------------------- | -------- |
| Benchmark corpus   | Same queries as MRR baseline           | ✓        |
| Custom file subset | Dev-specified files                    |          |
| Both options       | Default corpus + optional --files flag |          |

**User's choice:** Benchmark corpus

---

## Agent's Discretion

- Exact heuristic weights for quality score formula
- Quality score threshold for "low quality" classification
- Exact prompt wording for class grouping rules and few-shot examples
- Default example file format in `.ia-framework/prompt-examples/`
- Markdown report file location and naming for A/B comparison
- How prompt versions v1/v2 resolve to actual prompt content

## Deferred Ideas

None — discussion stayed within phase scope.
