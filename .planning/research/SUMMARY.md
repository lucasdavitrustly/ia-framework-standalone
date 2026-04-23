# Project Research Summary

**Project:** ia-framework v1.2 — Chunking Tuning & Retrieval Quality
**Domain:** RAG Quality Optimization — systematic tuning of existing LLM chunking and retrieval components
**Researched:** 2026-04-22
**Confidence:** HIGH

## Executive Summary

v1.2 is a **tuning milestone**, not a features milestone. The entire stack is already in place from v1.0/v1.1 — no new dependencies are needed. The work is prompt engineering (better chunk boundaries and summaries), fixing a critical score-filtering bug (RRF scores treated as cosine similarities), and building dashboard visibility to make tuning data-driven. The goal is pushing MRR past 0.7 through systematic iteration on existing components.

The recommended approach is **benchmark-first**: establish a frozen, reproducible baseline before touching any prompts or filters. The single highest-impact fix is the RRF score threshold bug — the current `scoreThreshold: 0.3` silently drops ALL results from hybrid/RRF searches because RRF scores are rank-based fractions (~0.0–0.1), not cosine similarities. After that, prompt engineering with per-query failure diagnosis is the main MRR lever. Dashboard tuning views (chunk inspector, score distributions) accelerate the iteration loop from ~10 cycles to 2-3.

Key risks: overfitting prompts to the 30-query benchmark corpus, tuning without reproducible baselines (LLM non-determinism), and score filtering that kills recall on hard queries. All are preventable with discipline — holdout validation sets, temperature=0 for benchmarks, and measuring Hit@K alongside MRR.

## Key Findings

### Recommended Stack

No new dependencies. All v1.2 work uses the existing stack: Ollama SDK for LLM chunking prompts, Qdrant for vector storage, Recharts for dashboard charts, Vitest for benchmarks, Zod for validation. The only "new" code is prompt strings, a ~50-line score filter function, and dashboard React views. See [STACK.md](./STACK.md) for full details.

**Core technologies (all existing):**

- **Ollama SDK** (`^0.6.3`): LLM chunking prompt iteration — change prompts, not code
- **Recharts** (`^3.x`): Score histograms, scatter plots, threshold visualization for tuning views
- **better-sqlite3**: Store prompt version metadata, per-query benchmark results, score distributions

### Expected Features

See [FEATURES.md](./FEATURES.md) for detailed analysis with dependency graph and prioritization matrix.

**Must have (P0-P1 — table stakes for v1.2):**

- Fix RRF score threshold bug — currently filtering all hybrid results (P0, active bug)
- Prompt boundary improvements — few-shot examples, class grouping, min chunk size (P1)
- Prompt summary improvements — intent-focused, domain terminology (P1)
- Prompt versioning — track which prompt produced which chunks (P1)
- Chunk overlap/gap detection — validate LLM chunk coverage (P1)
- Baseline + validation benchmarks — establish reproducible MRR before tuning (P1)

**Should have (P2 — differentiators):**

- Chunking quality inspector — view chunks alongside source code
- Score distribution analysis — histograms of candidate scores
- Filtering effectiveness view — returned vs. filtered with near-misses
- Prompt A/B testing workflow — CLI-driven comparison
- Summary quality scoring — heuristic quality checks

**Defer (P3/v1.3+):**

- Score gap detection, cross-encoder reranking, auto-tuning thresholds, multi-model testing

### Architecture Approach

Three workstreams (prompt engineering, score filtering, dashboard views) touch different packages but share the benchmark feedback loop. New code is minimal: `PromptRegistry` in indexer, `ScoreFilter` in retrieval, tuning routes in dashboard-api, and React tuning views. All changes integrate into existing component boundaries with no architectural shifts. Key decision: apply score filtering **after** RRF merge, not before, since pre-merge and post-merge scores are on different scales. See [ARCHITECTURE.md](./ARCHITECTURE.md) for full patterns, anti-patterns, and build order.

**New components:**

1. **PromptRegistry** (indexer) — named prompt template CRUD, stored as `.ia-framework/prompts.json`
2. **ScoreFilter** (retrieval) — adaptive filtering: relative threshold, gap detection
3. **Tuning API routes** (dashboard-api) — REST endpoints for prompt/chunk/filter management
4. **Tuning views** (dashboard) — chunk inspector, filter tuner, benchmark comparison

### Critical Pitfalls

See [PITFALLS.md](./PITFALLS.md) for all 12 pitfalls with full prevention strategies.

1. **Tuning without stable baseline** — Freeze corpus, set temperature=0, run 3x, store per-query results before any changes
2. **Global prompt changes without per-query diagnosis** — Analyze WHY specific queries fail before changing prompts; categorize failures by type (boundary, summary, embedding, threshold)
3. **Score threshold killing recall** — RRF scores ≠ cosine; use mode-aware thresholds; measure Hit@K impact before and after
4. **Overfitting to 30-query corpus** — Hold out 20% validation set; add diverse query types; spot-check in dashboard
5. **Chunk boundary changes invalidating embeddings** — Always full re-index after prompt changes; version prompts in Qdrant metadata; keep old collection alive until new one benchmarks better

## Implications for Roadmap

Based on combined research, the following phase structure respects dependency ordering, isolates risk, and groups related work.

### Phase 1: Baseline & Bug Fixes

**Rationale:** Nothing else is measurable without a stable baseline. The RRF threshold bug is actively harming results.
**Delivers:** Reproducible benchmark baseline, fixed hybrid search, prompt versioning infrastructure, chunk validation
**Addresses:** Fix RRF threshold bug (P0), baseline benchmarks (P1), prompt versioning (P1), chunk overlap/gap detection (P1)
**Avoids:** Pitfall 1 (no stable baseline), Pitfall 5 (unversioned chunks), Pitfall 10 (no version control)

### Phase 2: Prompt Engineering

**Rationale:** Prompt quality is the #1 MRR lever. Requires baseline from Phase 1 and versioning infrastructure.
**Delivers:** Improved chunk boundaries and summaries, measurable MRR improvement toward 0.7
**Addresses:** Boundary improvements (P1), summary improvements (P1), summary quality scoring (P2), A/B testing workflow (P2)
**Avoids:** Pitfall 2 (blind global changes), Pitfall 4 (overfitting), Pitfall 6 (summary length tradeoff)

### Phase 3: Score Filtering Refinement

**Rationale:** After prompt quality is improved, filtering refinement squeezes additional MRR. Includes quick win of RRF k-constant tuning.
**Delivers:** Mode-aware adaptive thresholds, optimized RRF k parameter, score distribution data collection
**Addresses:** Dynamic threshold per mode (P3), score gap detection (P3)
**Avoids:** Pitfall 3 (threshold killing recall), Pitfall 7 (untuned RRF k)

### Phase 4: Dashboard Tuning Views

**Rationale:** Highest value after core tuning is done — makes future iteration faster. Depends on tuning API routes and data from Phases 1-3.
**Delivers:** Chunk inspector, score distributions, filtering effectiveness, prompt comparison views
**Addresses:** All P2 dashboard features (chunking inspector, score analysis, filtering view, prompt comparison)
**Avoids:** Pitfall 8 (aggregate-only display), Pitfall 9 (ignoring AST collection — show per-collection metrics)

### Phase Ordering Rationale

- **Phase 1 first** because everything depends on reproducible measurement and the RRF bug fix is a P0
- **Phase 2 before 3** because better chunks have higher MRR impact than better filtering — prompt engineering is the #1 lever
- **Phase 3 before 4** because filtering refinement is backend-only and produces the score distribution data that dashboard views need
- **Phase 4 last** because dashboard views are visibility, not MRR improvement — they accelerate future tuning cycles but don't move MRR directly

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 2 (Prompt Engineering):** Inherently iterative — specific prompt text depends on per-query failure analysis done during execution. Plan the process and tooling, not the exact prompts.

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Baseline & Bug Fixes):** Bug fix + config infrastructure — code locations identified, changes are straightforward
- **Phase 3 (Score Filtering):** Parameter tuning with sweep — standard IR practice, ~50 lines of new code
- **Phase 4 (Dashboard Views):** CRUD dashboard views — standard React + REST + Recharts patterns

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                     |
| ------------ | ---------- | --------------------------------------------------------------------------------------------------------- |
| Stack        | **HIGH**   | No new deps — all verified in v1.0/v1.1 research                                                          |
| Features     | **HIGH**   | Based on direct codebase analysis, existing MRR data, and clear prioritization                            |
| Architecture | **HIGH**   | Integration points identified via code inspection; minimal new components; anti-patterns documented       |
| Pitfalls     | **HIGH**   | System-specific pitfalls from known architecture; standard IR methodology; concrete prevention strategies |

**Overall confidence:** **HIGH**

### Gaps to Address

- **Optimal prompt text:** Cannot be researched in advance — requires iterative experimentation with per-query diagnosis during Phase 2
- **RRF k-constant optimal value:** Requires parameter sweep during Phase 3 — literature default k=60 may not be optimal for code search
- **AST chunking quality baseline:** All v1.2 research focuses on LLM chunking; AST collection MRR should be measured independently in Phase 1 (Pitfall 9)
- **Benchmark corpus diversity:** Current 30 queries may be skewed toward certain patterns — need to assess and diversify during Phase 1

## Sources

### Primary (HIGH confidence)

- Existing codebase: `packages/retrieval/src/search-engine.ts`, `packages/indexer/src/strategies/prompt.ts`, `llm-chunker.ts`
- Qdrant docs (Context7) — RRF fusion score behavior, rank-based not cosine
- `.planning/research/MRR-IMPROVEMENT-RESEARCH.md` — prior retrieval quality research
- `.planning/PROJECT.md` — v1.2 scope definition, MRR > 0.7 target

### Secondary (MEDIUM confidence)

- RRF fusion literature (Cormack, Clarke & Buettcher 2009) — k=60 default, domain-dependent
- Standard IR evaluation methodology — holdout sets, reproducibility requirements

---

_Research completed: 2026-04-22_
_Ready for roadmap: yes_
