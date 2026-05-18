# Retrospective

---

## v1.6 — RAG Retrieval Quality Improvements (2026-05-18)

**Phases:** 37–41 (5 phases, 7 plans)
**Duration:** ~3 days (2026-05-15 – 2026-05-18)
**PRs:** #38 (Phase 37), #39 (Phases 38+39), #40 (Phases 40+41)

### What Was Built

| Phase | Feature                                                                                                                                                                                          | Plans |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 37    | Query Complexity Classifier — deterministic regex-based `classifyQuery()` routing keyword/symbol queries to BM25, integrated into both search handlers with fallback-to-semantic on zero results | 2     |
| 38    | Line-Number-Aware Chunking — `file:startLine-endLine` display in MCP results, pipeline validation warning for out-of-bounds chunks                                                               | 1     |
| 39    | Confidence-Based Early Exit — `earlyExitConfidence` config field (default 0.8), structured logging of earlyExit/earlyExitReason in search handlers                                               | 1     |
| 40    | Benchmark Preflight Tool — expanded from 3→5 tools, `BenchmarkPreflightError` class, preflight gate in `BenchmarkRunner.run()` with `skipPreflight` option                                       | 2     |
| 41    | Hybrid Retrieval Tuning — 4 config fields (`rrfK`, `rrfScoreThreshold`, `keywordPrefetchMultiplier`, `semanticPrefetchMultiplier`) wired through SearchEngine to Qdrant                          | 1     |

### What Went Well

- **Benchmark-driven development** — requirements derived directly from A/B benchmark results gave clear, measurable targets
- **Small focused phases** — each phase was S or M size, shipped independently, easy to review
- **TDD discipline** — all phases had tests first, no regressions introduced
- **Fast velocity** — 5 phases in 3 days with clean separation of concerns

### What Didn't Go Well

- **Phase 39 merge gap** — PR #39 was titled "Phase 38" but branch contained both 38 and 39. The squash-merge only brought phase 38 code to main; phase 39 code stayed on the branch unmerged until caught during milestone completion
- **No milestone audit** — skipped formal audit before archiving; caught the merge gap during archive process instead

### Lessons Learned

1. When shipping multiple phases on one branch, verify ALL phase code lands on main after PR merge (especially with squash-merge)
2. Run `/gsd-verify-phase` after each PR merge, not just after local completion
3. Branch naming should reflect all phases included (e.g., `phase-38-39-*` not `phase-38-*`)

---

## v1.4 — RAG Quality & Token Control (2026-04-30)

**Phases:** 30–31 (2 phases, 5 plans)
**Duration:** ~1 day (2026-04-30)

### What Was Built

| Phase | Feature                                                                                                                                                                                                                                                          | Plans |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 30    | Adaptive Decorator Chunking — annotation/decorator co-location in Java and TypeScript AST chunker; `@Aspect` class detection emitting single `aspect` chunks; LLM prompt anti-split rule and AOP few-shot example                                                | 3     |
| 31    | Dynamic Retrieval Cost Cap — `estimateTokens`/`applyTokenCap` utility with minimum-1 guarantee; `maxTokensPerCall` config schema field; 70/30 direct/hierarchy budget split wired into both search handlers; `token_cap_applied` metadata in structured response | 2     |

### What Worked Well

**Both phases shipped fast and clean.** Phase 30 was 3 plans across the Java parser, TypeScript parser, and integration tests — each focused and atomic. Phase 31 was 2 plans: utility first, wiring second. No deviations from plan in either phase.

**TDD RED-GREEN discipline on Phase 31 paid off immediately.** The token cap utility was committed as failing tests before any implementation. Because the interface was locked by tests before writing `applyTokenCap`, the wiring plan (31-02) integrated with zero surprises.

**70/30 budget split was a clean design.** Separating direct result budget from hierarchy expansion budget made the token accounting straightforward and the tests easy to reason about. A flat cap would have required more test cases to cover hierarchy edge cases.

**The `minimum-1` guarantee simplified callers.** `applyTokenCap` never returns an empty array — the first result always passes through even if it alone exceeds the cap. This meant the handler code needed no empty-result guard after capping.

**Decorator co-location was already partially correct for TypeScript.** The `export_statement` node in tree-sitter-typescript naturally starts at the decorator line for exported classes. The Phase 30 fix only needed to handle non-exported classes, which kept the patch small.

### What Was Inefficient

**Phase 30 had a pre-existing test bug discovered mid-plan.** `toBe('Base')` → `toBe('BaseService')` in `chunker.test.ts` was a leftover from an earlier refactor. It didn't block the plan but added a small fix commit outside the plan scope.

**`@Aspect` detection required understanding tree-sitter node shape before writing tests.** The modifiers/children traversal pattern for detecting `marker_annotation` under `class_declaration` was not obvious from the grammar. A quick WASM grammar probe step would save ~5 minutes in future phases adding new Java node type handling.

### Key Lessons

1. **Two-plan phase structure works well for utility + wiring patterns.** Build the utility with full tests in plan 01, wire it in plan 02. The interface contract is locked before integration begins.

2. **Token estimation heuristics should be documented as decisions.** The `ceil(length/4)` heuristic (D-01) was chosen for simplicity and zero dependencies. This is the kind of decision that looks arbitrary later without a written rationale. Add to key decisions at plan time, not retro time.

3. **Metadata should be emitted conditionally.** Adding `token_cap_applied` and `results_trimmed` only when trimming actually occurs keeps structured content clean for the common case (cap not hit). This pattern is worth repeating for future observability fields.

### Stats

- Total plans: 5
- Total test files modified: 5
- Total tests added: ~24 (9 token-cap unit, 4 schema, 5 integration, 6 handler)
- Deviations from plan: 0
- Average plan duration: ~4 minutes

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
