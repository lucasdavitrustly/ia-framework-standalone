# Retrospective

---

## v1.3 — RAG Quality Improvements (2026-04-29)

**Phases:** 22–27 (6 phases, 13 plans)
**Duration:** ~1 day (2026-04-28 → 2026-04-29)

### What Was Built

| Phase | Feature                                                                                                                                                            | Plans |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 22    | Java AST-aware chunking — class preamble (package + imports + class signature) prepended to each method chunk; Spring Boot annotation fix                          | 2     |
| 23    | Zero-result fallback search — semantic → hybrid → BM25 keyword chain with "did you mean?" suggestions in MCP tools                                                 | 2     |
| 24    | Maven multi-module dependency graph — POM parser, BFS transitive traversal, SQLite persistence, `get_module_dependencies` MCP tool                                 | 3     |
| 25    | RAG-to-action prompt templates — intent detection (impact-analysis / dependency-trace) with structured scaffolding injected into search responses                  | 2     |
| 26    | Hallucination penalty calibration — 6th scoring dimension (binary 0/5) in benchmark judge, double-penalty rule, /30 total                                          | 1     |
| 27    | Benchmark model lock enforcement — `--strict-model` CLI flag, `validate-models` subcommand, `run_integrity` field, model identity parsing from LLM-IDENTITY blocks | 3     |

### What Worked Well

**Small, focused phases.** Each phase had 1–3 plans and shipped in 3–12 minutes per plan. The tight scope prevented scope creep and kept commits atomic.

**TDD discipline held.** Every plan followed RED → GREEN with separate commits. The discipline paid off during the Phase 27 code review — the reviewer found 6 bugs, and the test suite made regressions impossible to miss during fixes.

**Zero-result fallback was high-value for low effort.** Phase 23 took ~21 minutes total and meaningfully improves the agent experience on queries with no semantic matches — the most frustrating failure mode for RAG users.

**Hallucination fix was well-scoped.** Phase 26 identified a concrete scoring anomaly (hallucinated response outscoring correct response 11/25 vs 7/25) and fixed it with a binary penalty rule. Clear problem, clear solution.

**`fast-xml-parser` was the right call.** DOMParser unavailability in Node.js was a known constraint; choosing a zero-dependency XML parser for the Maven POM work avoided adding complexity.

### What Was Inefficient

**Phase 27 required significant post-merge fixes.** Six bugs were found in code review after the initial implementation: null-dereference, broken `validate-models` subcommand logic, always-true empty string guard, incorrect `runIntegrity` gating, N+1 query in `listRuns`, and duplicate export. The TDD cycle was followed, but the implementation had logic gaps that tests didn't catch (particularly around the validate-models DB query path). This added an extra session for fixes after the PR was already under review.

**`validate-models` was the most complex plan.** The CLI command needed to re-query the DB for stored `modelMismatch`/`identityMissing` flags rather than re-parsing rawResponse. The initial implementation used the wrong field (`embeddingModel` instead of `configuredModel`) and a broken re-parse path. More upfront design clarity on the data flow would have prevented this.

**Phase 26 had no VERIFICATION.md.** The hallucination calibration phase modified agent prompt files (not code), so no automated tests were possible. But a manual benchmark run to confirm the scoring behavior before closing the phase would have been valuable.

### Key Lessons

1. **Logic-heavy CLI subcommands need integration-style tests, not just structure tests.** Phase 27's `validate-models` had structure tests (does the subcommand exist?) but no tests verifying the actual DB query path and output format. Add data-flow tests for any subcommand that reads from a store.

2. **Post-merge code review is expensive.** The 6-fix session after Phase 27 merge took longer than the original 3 plans. Pre-merge self-review checklist (null-safety, correct field names, query patterns) would front-load that cost.

3. **Java/Spring Boot support required more coordination than expected.** Phase 22 needed a bug fix (annotation-prefixed class preamble) that only surfaced with real Spring Boot patterns. Phase 24 needed a third plan (24-03) to wire the actual Qdrant filter after the stub was merged. Consider requiring real-world integration tests for new language/framework support.

4. **Binary scoring dimensions are cleaner than graded ones for penalty cases.** Phase 26's 0/5 binary Hallucination Check is unambiguous — partial credit would have been harder to calibrate and easier to game. For penalty dimensions, binary is the right default.

### Stats

- Total plans: 13
- Total test files added/modified: ~12
- Total tests added: ~60
- Bugs caught post-merge: 6 (all in Phase 27)
- Average plan duration: ~6 minutes

---

## v1.2 — Benchmark Quality (2026-04-22)

_Retrospective not written at milestone close._

## v1.1 — LLM Chunking (2026-04-16)

_Retrospective not written at milestone close._

## v1.0 — Foundation (2026-04-15)

_Retrospective not written at milestone close._
