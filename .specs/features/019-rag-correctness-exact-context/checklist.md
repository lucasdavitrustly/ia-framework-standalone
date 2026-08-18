# Specify Quality Checklist — 019 RAG Correctness, Deterministic Query Planning, Exact Context

Run before approving `spec.md` and moving to Design.

## Closure gate (scope tier: Complex → full gate)

- [x] **Unambiguity + precision.** Every acceptance criterion is WHEN/THEN/SHALL with a single
      interpretation and a spec-defined expected outcome. Criteria that could read two ways were
      split (e.g. WS1 dimension support split into "supported → apply" / "unsupported → refuse" /
      "native equals configured → proceed without parameter", the last as an edge case).
- [x] **Open-questions / assumptions closure.** 26 assumptions recorded (A-01..A-26), each with a
      chosen default and rationale. `Open questions: none`.
- [x] **Declined gray areas logged.** Eight gray areas were put to the user and all eight were
      answered; the answers are recorded as A-13 (prefix migration), A-12 (top-5 removal), A-08
      (token counting), A-18 (existence/aggregation), A-17 (plan taxonomy), A-16 (tokenizer
      unification), A-15 (filter threading), plus the adjacent-defect inclusion decision reflected
      in EMB-07/EMB-10/EMB-11, FLT-11/FLT-12, SPR-11.
- [x] **Gate bounded to this feature.** No requirement was invented outside the nine workstreams
      plus the four user-approved adjacent defects. Out of Scope lists 13 explicit exclusions.

## Implicit-requirement dimensions sweep (Complex → all dimensions must resolve)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | INP-01..INP-03 (provider input, batch item-count, request total size), EMB-03/EMB-04 (vector length), SPR-10 (sparse index validity), edge cases for empty/whitespace inputs and 1-2 character queries. |
| Failure / partial-failure states | EMB-06, INP-08, INP-09, INP-11, FAIL-01..FAIL-08. Partial batch failure, retry exhaustion, per-input isolation, degradation without unrelated evidence. |
| Idempotency / retry / duplicate handling | INP-08 (retryable vs non-retryable), QP-05 (identical inputs → identical plan), CTX-13..CTX-15 (dedup and merge), BUD-14 (cache key correctness incl. index generation). |
| Auth boundaries & rate limits | **N/A because** this is a local-first, single-user code index with no multi-tenant or authenticated surface; explicitly excluded by the caller and listed in Out of Scope. Provider API key handling is unchanged. |
| Concurrency / ordering | FLT-05 (deterministic ordering by repo/path/line), SPR-04 (deterministic sparse ordering), CTX-15 (ranking preserved after dedup), INP-10 (deterministic cancellation), edge case for hash-collision weight combination. |
| Data lifecycle / expiry | BUD-14 (cache invalidation by index generation), EMB-08/EMB-09 (persisted contract lifecycle), FLT-09 (payload index addition without destructive re-index), A-14/EMB-10 (no unconsented destructive recreation), FAIL-05 (staleness marking). |
| Observability | BUD-15 (full diagnostics set), BUD-04 (compact, non-duplicating), FAIL-08 (degradation reported in response), OPS-01/OPS-02 (P3 contract-state inspection). |
| External-dependency failure | FAIL-01 (provider, store, filesystem, pagination, plan, enrichment failure classes), FAIL-06 (unavailable infrastructure distinguishable from empty), SPR-06 (adapter capability gating), EMB-02/EMB-05 (provider capability and truncation behavior). |
| State-transition integrity | EMB-08..EMB-11 (collection contract states: created / matching / mismatched / unknown / unreadable), FLT-04 (complete vs ceiling-truncated), BUD-08 (normal vs overflow), INP-10 (no contract-inconsistent writes on cancellation). |

## Story quality

- [x] Every P1 story is independently testable and has an explicit Independent Test.
- [x] Stories are ordered so foundational contracts (WS1–WS4) precede query planning (WS5),
      enrichment (WS6), and context optimization (WS7–WS8), matching the required task ordering.
- [x] Each story states Why P1/P2/P3.
- [x] No story requires the benchmark subsystem.

## Traceability

- [x] 105 requirement IDs, all mapped to a story.
- [x] Category prefixes align 1:1 with the nine workstreams plus DOC and OPS.
- [x] Coverage line was present and honestly marked 0 task-mapped at Specify time; current execution
      status and completed tasks are tracked in `tasks.md` and `.specs/STATE.md`.

## Mandated Specify-phase obligations

- [x] `rag-architect` skill explicitly loaded before clarification and before drafting.
- [x] Existing implementation inspected before finalizing requirements — `packages/embedding`,
      `packages/vector-store`, `packages/retrieval`, `packages/mcp-server`, `packages/indexer`
      enrichment, `packages/core` config schema, `docs/`, `README.md`, prior specs 008/011/016/017.
- [x] Current implementation compared against skill recommendations — see the
      "Current implementation vs. skill recommendations" table with per-gap severity.
- [x] Context7 consulted for Qdrant JS (`/qdrant/qdrant-js`), OpenAI embeddings
      (`/websites/developers_openai_api`), and Ollama embeddings (`/ollama/ollama`); findings
      recorded in "Library Contracts Verified" and used to ground A-01, A-02, A-03, A-05, SPR-01,
      SPR-10, FLT-01, FLT-03.
- [x] RAG principles that informed requirements recorded, including **rejected** patterns
      (LLM query rewriting, HyDE, multi-query, step-back, generic fixed-size chunking,
      production guardrails, evaluation frameworks).
- [x] Benchmark and evaluation work documented as out of scope (two dedicated Out of Scope rows
      plus a Success Criterion asserting no benchmark file is modified).
- [x] Unresolved RAG design decisions either asked (8 questions) or recorded as assumptions (26).
- [x] Specification is requirement-shaped, not an implementation plan: no file paths, class names,
      function signatures, or module layouts appear in any acceptance criterion. Code citations
      appear only in the problem/gap analysis and assumption rationales, where they establish
      factual grounding.

## Anti-patterns checked

- [x] No acceptance criterion prescribes *how* to implement (e.g. FLT-01 says "use a Qdrant
      filter-only operation" — a capability constraint given the fixed-store constraint — but does
      not name `scroll` vs `retrieve`, which is a Design choice).
- [x] No criterion is untestable ("fast", "good", "clean" absent; A-08/BUD-13 convert "accurate
      token counting" into a testable non-under-reporting margin).
- [x] The taxonomy of the shared plan is deliberately left to Design (A-17), with the spec
      constraining only the observable property: computed once, two orthogonal dimensions, no
      downstream re-classification.
- [x] Migration/compatibility is stated as a requirement outcome (EMB-09, EMB-10, FLT-09,
      unknown-contract edge case), with the mechanism deferred to Design.
