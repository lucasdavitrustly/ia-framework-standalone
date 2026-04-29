# Phase 26: Hallucination Penalty Calibration in Benchmark Judge - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Update the benchmark judge agent prompt (`.opencode/agents/benchmark-judge.md`) to explicitly penalize hallucination via a new "Hallucination Check" scoring dimension and structured entity verification. Responses that assert facts about non-existent entities receive 0 on Hallucination Check (and 0 on Factual Precision). Score total goes from /25 to /30.

The judge is an OpenCode agent prompt — **not** a TypeScript module. No new TypeScript files are required for this phase.

Package: `.opencode/agents/benchmark-judge.md` (agent prompt update only)

</domain>

<decisions>
## Implementation Decisions

### Problem Statement (from benchmark run 2026-04-24)

The blind judge scored a fully hallucinated response (fabricated `CryptoPaymentAdapter` class) at 11/25 — higher than the factually correct "class doesn't exist" answer at 7/25. The judge had no explicit instruction to penalize fabrication and no entity context to cross-reference against.

### Hallucination Detection Instruction

- **D-01:** Add a new scoring dimension "Hallucination Check" (0 or 5 points). Score 0 when the response asserts facts about entities not present in the Verified Entities list; score 5 when no hallucinations detected.
- **D-02:** The benchmark executor (`.opencode/agents/benchmark-executor.md`) injects a structured `## Verified Entities` section into the judge prompt for each query. This section lists known class names and method names from the query's corpus context.
- **D-03:** For negative queries (entity does not exist), the Verified Entities section explicitly labels the queried entity as non-existent: e.g., `- CryptoPaymentAdapter — does NOT exist in this codebase`.
- **D-04:** Entity list contains class/method names only — not file paths. File paths are included in expectedFiles but rarely appear verbatim in responses.
- **D-05:** Judge instruction addition (in Rules section): "Before scoring, check the `## Verified Entities` section. If the response asserts facts about classes, methods, or interfaces not listed as verified, set Hallucination Check = 0 and set Factual Precision = 0. List flagged entity names in `hallucination_flags`."

### Honest Uncertainty Scoring

- **D-06:** Add explicit rubric instruction in Actionability dimension: "A response that correctly identifies a queried entity as non-existent AND points to nearby related entities that do exist scores 4-5 on Actionability, regardless of brevity. Correct negative identification + nearby pointers is fully actionable."
- **D-07:** Threshold for "good negative answer": correctly identifies non-existence + names at least one real nearby entity (class, method, or file that exists and is related). Pointing to related real entities is required; query reformulation is not.

### Score Denominator

- **D-08:** Total score updates from /25 to /30 with the addition of the Hallucination Check dimension (0 or 5 points). Update the output format table header and Total row accordingly.
- **D-09:** Existing benchmark reports remain at /25 and are not retroactively updated — the incompatibility is explicit and expected.
- **D-10:** Add a rubric version note to the judge output header (e.g., `Rubric v2 (30 pts)`) so reports are self-labeling and pre/post-change runs are distinguishable at a glance.

### Rescore CLI

- **D-11:** `ia-framework benchmark rescore` CLI command is **out of scope** for Phase 26. This phase only updates the judge agent prompt.
- **D-12:** Validation of the fix uses the existing 2026-04-24 benchmark report as a manual re-score test. After the judge update, running the judge on the CryptoPaymentAdapter prompt pair must flip the ranking: "class doesn't exist" answer must score higher than the hallucinated response.

### Agent's Discretion

- Exact wording of the Hallucination Check rubric rows (0 and 5 point descriptions)
- Exact wording of the entity verification instruction in the Rules section
- Format of the `hallucination_flags` output (inline list vs dedicated section)
- How the benchmark executor assembles the Verified Entities list from the query corpus entry (implementation detail for the executor agent)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Judge agent (primary target)

- `.opencode/agents/benchmark-judge.md` — The benchmark judge agent prompt; this is the file being updated. Contains the 5-dimension rubric (Factual Precision, Technical Depth, Code References, Completeness, Actionability), scoring tables, output format, and Rules section.

### Benchmark executor (injects entity context)

- `.opencode/agents/benchmark-executor.md` — The benchmark executor agent; assembles judge calls. Must be updated to inject `## Verified Entities` section into each judge prompt invocation.

### Benchmark corpus (source of entity metadata)

- `.ia-framework/benchmark-queries.json` — Query corpus; each entry has `id`, `query`, `expectedFiles`, `description`. Negative queries (non-existent entities) are the primary validation set. The Verified Entities list is derived from this file per query.

### Anomalous run (validation fixture)

- `.ia-framework/benchmark-reports/benchmark-2026-04-24-104320.md` — The 2026-04-24 benchmark run showing the CryptoPaymentAdapter anomaly. Used as manual re-score validation: after the fix, the "class doesn't exist" response must outscore the hallucinated one.
- `.opencode/benchmark/reports/benchmark-2026-04-24-104320-github-copilot-gpt-5.4.md` — Alternate copy of the same report.

### Benchmark skill and guide

- `.opencode/skills/rag-benchmark/SKILL.md` — RAG benchmark skill; describes the full benchmark protocol including judge invocation. May reference rubric format.
- `.opencode/benchmark/guide.md` — Benchmark guide; update if it documents the scoring rubric or total score.

</canonical_refs>

<code_context>

## Existing Code Insights

### Judge is a markdown agent prompt, not TypeScript

The benchmark judge lives in `.opencode/agents/benchmark-judge.md`. It is an OpenCode subagent with `temperature: 0.0`, a 5-dimension rubric table, and a strict output format. The TypeScript `packages/benchmark` package handles retrieval metrics (Hit@K, MRR) only — no LLM judge calls exist in TypeScript.

### Reusable Assets

- Existing 5-dimension rubric structure (Factual Precision, Technical Depth, Code References, Completeness, Actionability): add Hallucination Check as dimension 6 in the same table format.
- Existing output format with `| Dimension | Score | Justification |` table rows: add a new row for Hallucination Check and update the Total row to /30.
- Existing Rules section at bottom of judge prompt: append the entity verification rule here.
- `.ia-framework/benchmark-queries.json`: already has `expectedFiles` per query — the entity list is derived from these plus the query description text.

### Established Patterns

- Score dimensions are presented as rubric tables with 5 rows (score 1-5, or in this case 0 and 5 for binary Hallucination Check).
- Output format is fixed and strict — the judge output section template must be updated to include `hallucination_flags`.
- Rules section is a bullet list of evaluation constraints — new entity verification rule appends naturally here.

### Integration Points

- Benchmark executor assembles the judge call: needs to add `## Verified Entities` section injection per query.
- Benchmark reporter reads judge output markdown and extracts scores: must handle the new /30 total and `hallucination_flags` field if present.
- `.opencode/skills/rag-benchmark/SKILL.md`: may reference rubric format and need updating.

</code_context>

<specifics>
## Specific Ideas

- The CryptoPaymentAdapter query is the canonical regression test: after the fix, running the updated judge on the stored responses from that query must flip the result (correct answer > hallucinated answer).
- "Rubric v2 (30 pts)" label in judge output header — simple, visible version indicator.
- Negative query Verified Entities format: `- CryptoPaymentAdapter — does NOT exist in this codebase` — explicit non-existence label prevents ambiguous absence.

</specifics>

<deferred>
## Deferred Ideas

- `ia-framework benchmark rescore <run-id>` CLI command — deferred to a follow-on phase; would require TypeScript infrastructure to re-invoke the judge on stored markdown reports.
- TypeScript `judge.ts` module in `packages/benchmark/src/` — not needed for this phase; judge lives in the agent prompt.
- Automated hallucination detection without LLM judge (embedding-based entity verification) — too complex for v1.3.
- Real-time hallucination flagging in MCP server responses — separate concern from benchmark scoring.
- `hallucination_rate` metric in dashboard (`prompts with flags / total`) — can be added once rescore infrastructure exists.

</deferred>

---

_Phase: 26-hallucination-penalty-calibration_
_Context gathered: 2026-04-28_
_Source: Discussion session — corrected judge location (agent prompt, not judge.ts); updated canonical refs_
