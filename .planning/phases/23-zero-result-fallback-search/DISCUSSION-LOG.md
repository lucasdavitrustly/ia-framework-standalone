# Phase 23 Discussion Log

**Date:** 2026-04-28
**Participants:** Developer + AI advisor
**Purpose:** Update existing CONTEXT.md with implementation decisions for gray areas

## Gray Areas Discussed

### GA-1: Score threshold handling across fallback steps

**Question:** If user passes `score_threshold: 0.6`, should fallback respect it (risking zero results again)?
**Decision (D-07):** Ignore user threshold in fallback. Fallback steps always use mode-appropriate defaults (0.0 for hybrid/BM25). User threshold only gates primary search.
**Rationale:** The purpose of fallback is to always produce suggestions. Applying a cosine threshold to RRF scores is nonsensical anyway.

### GA-2: Where does fallback logic live?

**Question:** MCP tool layer vs engine layer vs wrapper?
**Decision (D-08):** Engine layer — `searchWithFallback()` on `SearchEngine`.
**Rationale:** Reusable by dashboard, benchmarks, and any future consumer. Single place to maintain retry logic.

### GA-3: BM25 keyword-only search doesn't exist

**Question:** Third fallback step requires BM25-only but no method exists.
**Decision (D-09):** Add `searchKeyword()` to the vector store interface for sparse-only Qdrant queries.
**Rationale:** Three-step fallback (semantic → hybrid → keyword) provides maximum coverage. Worth the implementation cost.

### GA-4: Should hybrid tool also get fallback?

**Question:** `search_codebase_hybrid` also returns zero results sometimes.
**Decision (D-10):** Yes — one fallback step: hybrid → BM25 keyword-only (limit 3).
**Rationale:** Even though hybrid is broad, pure keyword matching catches cases where embeddings miss entirely.

### GA-5: Score normalization in suggestions

**Question:** Scores from different modes are incomparable. How to present?
**Decision (D-11):** Drop scores entirely from suggestions. Include only `file`, `name`, `snippet`.
**Rationale:** LLM doesn't use numeric scores. Cross-mode scores are confusing. Simpler envelope.

### GA-6: Fallback trigger point — before or after threshold filtering?

**Question:** If Qdrant returns results but all are below threshold, does fallback fire?
**Decision (D-12):** After filtering. Empty final result set = fallback fires.
**Rationale:** Combined with D-07 (ignore threshold in fallback), this ensures suggestions always appear regardless of why primary search was empty.

## Changes to Prior Decisions

- **D-01 updated:** Clarified this is the semantic search tool's fallback chain. Hybrid tool has its own (D-10).
- **D-02 updated:** Removed `score` from suggestions array, added `fallback_mode` field to envelope.
- **Domain boundary updated:** Expanded to include `packages/retrieval` as primary package (engine layer) with MCP as consumer.
