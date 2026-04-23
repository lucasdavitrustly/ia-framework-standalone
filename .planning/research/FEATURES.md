# Feature Research: ia-framework v1.2 — Chunking Tuning & Retrieval Quality

**Domain:** AI-Assisted Development Framework — RAG Quality Optimization
**Researched:** 2026-04-22
**Confidence:** HIGH

## Scope

This document covers **v1.2 features only**: LLM chunking prompt engineering, score-based result filtering, benchmark-driven validation, and dashboard tuning views. All v1.0/v1.1 infrastructure (AST+LLM chunking, hybrid search, multi-collection search, dashboard search/analytics) is assumed operational.

**Goal:** Push MRR past 0.7 through systematic tuning of existing components, not new infrastructure.

---

## Feature Landscape

### Table Stakes (Must Ship for v1.2 to Have Value)

| Feature                                                 | Why Expected                                                                                                                                                   | Complexity | Dependencies                                                         | Notes                                                                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prompt engineering: boundary detection improvements** | Current prompt produces chunks with imprecise boundaries (imports mixed with logic, classes split mid-method). Fixing boundaries is the #1 lever for MRR.      | MEDIUM     | Existing `prompt.ts`, `llm-chunker.ts`                               | Iterative: change prompt → re-index subset → benchmark → compare. Need A/B prompt testing workflow.                                           |
| **Prompt engineering: summary quality improvements**    | Summaries are the `text` vector content for LLM chunks. Weak summaries = weak semantic matching = low MRR on intent queries.                                   | MEDIUM     | Existing `prompt.ts`, embedding pipeline                             | Summaries should capture PURPOSE ("authenticates JWT tokens and returns user context") not SYNTAX ("function that takes a string parameter"). |
| **Score-based result filtering: adaptive thresholds**   | Current fixed `scoreThreshold: 0.3` is a blunt instrument. Hybrid/RRF scores are rank-based, not cosine — a single threshold doesn't work across search modes. | MEDIUM     | `search-engine.ts`, `multi-collection-search-engine.ts`, `qdrant.ts` | Different filtering strategies for dense-only vs. hybrid vs. cross-collection searches.                                                       |
| **Benchmark-driven validation of every change**         | Without before/after MRR measurement, prompt changes are guesswork. Every tuning change must produce a measurable delta.                                       | LOW        | Existing benchmark system, CLI `ia-framework benchmark`              | Workflow: baseline benchmark → make change → re-index → benchmark → compare. Mostly process, minimal new code.                                |

### Differentiators (What Makes v1.2 Genuinely Valuable)

| Feature                                     | Value Proposition                                                                                                                                                                  | Complexity  | Dependencies                                        | Notes                                                                                                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prompt versioning system**                | Track which prompt version produced which chunks. When MRR drops, identify which prompt change caused it. Enables systematic prompt engineering instead of ad-hoc edits.           | MEDIUM      | `prompt.ts`, MetricsStore, benchmark store          | Store prompt version hash with each indexed collection. Benchmark results tagged with prompt version.                                                                              |
| **Score distribution analysis**             | Show HOW scores are distributed per query, not just top-K results. Reveals whether filtering is cutting relevant results (too aggressive) or letting noise through (too loose).    | LOW-MEDIUM  | Dashboard search page, MetricsStore                 | Histogram of all candidate scores (top-50), not just returned results. Shows the "filtering decision boundary."                                                                    |
| **Dashboard: chunking quality inspector**   | View individual chunks with their boundaries, summaries, and scores side-by-side with source code. Developers see exactly what the LLM produced and whether boundaries make sense. | MEDIUM-HIGH | Dashboard, Qdrant payload data, syntax highlighting | Critical for prompt tuning: you need to SEE the chunks to know if the prompt is working. Without this, prompt engineering is blind.                                                |
| **Dashboard: filtering effectiveness view** | Visualize what gets filtered out and why. Show "near-miss" results (just below threshold) alongside returned results. Developers understand noise vs. signal tradeoff.             | MEDIUM      | Dashboard search page, score distribution data      | Two-zone display: "returned" (above threshold) and "filtered" (below threshold, top N). Color-coded by relevance.                                                                  |
| **Dynamic score threshold per search mode** | Hybrid/RRF scores use rank-based fusion (not cosine). Dense-only uses cosine. Apply mode-appropriate thresholds automatically.                                                     | LOW-MEDIUM  | `search-engine.ts`, config                          | Config: `{ dense: 0.3, hybrid: 0.01, rrf: 0.0 }`. RRF scores should never be threshold-filtered — rely on `limit` instead.                                                         |
| **Prompt A/B testing workflow**             | Compare two prompt versions on the same benchmark corpus. Side-by-side MRR, per-query deltas, chunk quality diffs.                                                                 | MEDIUM      | Benchmark system, prompt versioning                 | Index with prompt A → benchmark → index with prompt B → benchmark → compare runs. Mostly orchestration, some new CLI UX.                                                           |
| **Chunk overlap/gap detection**             | Validate that LLM chunks cover every line exactly once (no gaps, no overlaps). Current prompt requests this, but LLMs often violate it. Auto-detect and report violations.         | LOW         | `llm-chunker.ts`                                    | Post-processing validation. Report: "Lines 45-48 not covered by any chunk" or "Lines 30-35 covered by chunks 3 and 4." Fix by adjusting boundaries or re-prompting.                |
| **Summary quality scoring**                 | Heuristic quality score for each chunk summary: length check, avoids code syntax in prose, mentions purpose not just identifiers, covers imports/exports context.                  | LOW         | `llm-chunker.ts` or new utility                     | Not ML-based — simple heuristics: summary length 20-200 chars, no raw code tokens, contains verbs ("handles", "validates", "configures"). Dashboard shows per-chunk quality score. |

### Anti-Features (Do NOT Build in v1.2)

| Feature                                    | Why Requested                                       | Why Problematic                                                                                                                                                                        | Alternative                                                                                                               |
| ------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **User-editable prompt templates**         | "Let me write my own chunking prompts"              | Creates support burden. Prompt engineering for code chunking is nuanced — users will write bad prompts, get bad chunks, blame the tool. The framework should own prompt quality.       | Ship optimized prompts with version tracking. Expose config knobs (max chunk size, language hints) not raw prompt text.   |
| **Auto-tuning score thresholds**           | "Automatically find the best threshold"             | Requires labeled relevance data at scale. The benchmark corpus (30 queries) isn't large enough for statistically meaningful threshold optimization. Premature automation.              | Show score distributions in dashboard. Let developer pick threshold informed by data. Provide sensible per-mode defaults. |
| **Cross-encoder reranking**                | "Rerank results with a neural model for better MRR" | Adds Python sidecar dependency, 500ms+ latency, model management complexity. The MRR target (>0.7) is achievable through prompt + filtering tuning alone. Reranking is v1.3+ material. | Focus on first-stage retrieval quality. Better chunks + better filtering = better results without reranking overhead.     |
| **Multi-model prompt testing**             | "Try different Ollama models for chunking"          | Model switching changes two variables at once (model capability + prompt interaction). Isolate variables: fix the model (llama3.2), tune the prompt.                                   | Stick with llama3.2 (validated in Phase 12). Change models only after prompt is optimized and MRR plateau is reached.     |
| **Automatic re-indexing on prompt change** | "Re-index everything when I change the prompt"      | Full LLM re-indexing takes 200+ minutes for 500 files. Automatic triggering wastes compute. Prompt iteration should use a subset (10-50 representative files).                         | CLI command: `ia-framework index --strategy llm --files subset.txt` for targeted re-indexing during prompt tuning.        |

---

## Feature Dependencies

```
Prompt Engineering (Core Loop)
    ├── Prompt Versioning (track which prompt produced which chunks)
    │     └── Benchmark tagging (link benchmark results to prompt version)
    ├── Chunk Overlap/Gap Detection (validate prompt output quality)
    ├── Summary Quality Scoring (heuristic quality checks)
    └── Prompt A/B Testing Workflow (compare versions systematically)
          ├── Benchmark system (existing — runs MRR comparison)
          └── Dashboard benchmark comparison (existing — v1.1)

Score-Based Filtering
    ├── Dynamic Threshold Per Search Mode (dense vs hybrid vs RRF)
    │     └── Search engine config extension
    ├── Score Distribution Analysis (understand what filtering does)
    │     └── Dashboard visualization
    └── Near-Miss Result Display (see what got filtered)

Dashboard Tuning Views
    ├── Chunking Quality Inspector (view chunks + source + summaries)
    │     ├── Qdrant payload retrieval (get chunk metadata)
    │     └── Syntax highlighting (existing — from v1.1 search UI)
    ├── Filtering Effectiveness View (returned vs filtered results)
    │     └── Score distribution data
    └── Prompt Version Comparison (which version → which MRR)
          └── Prompt versioning + benchmark tagging

Benchmark-Driven Validation (Process, Not Feature)
    └── Existing benchmark system + CLI — no new code needed
```

### Dependency Notes

- **Prompt versioning is foundational.** Without tracking which prompt produced which results, A/B testing and dashboard views can't attribute quality changes to prompt changes. Build first.
- **Score distribution analysis enables filtering tuning.** You can't tune thresholds without seeing score distributions. Build distribution view before dynamic thresholds.
- **Chunking quality inspector is the highest-value dashboard feature.** Prompt engineering without seeing the chunks is blind iteration. This view turns a 10-iteration cycle into 2-3 iterations.
- **Chunk validation (overlap/gap detection) is cheap and high-value.** Simple post-processing in `llm-chunker.ts`. Catches the most common LLM failure mode.

---

## Detailed Feature Analysis

### 1. Prompt Engineering: Boundary Detection

**Current prompt problems (inferred from architecture):**

The current prompt in `prompt.ts` is reasonable but has known LLM failure modes:

1. **Imports lumped with first function** — The prompt says "Import/export blocks should be their own chunk" but small models (llama3.2) often merge imports with the first declaration.
2. **Class methods split from class** — LLM may create separate chunks for each method instead of keeping a class as one semantic unit (or intelligently splitting large classes).
3. **Configuration blocks fragmented** — Object literals, enums, and config maps get split arbitrarily.
4. **Comment blocks orphaned** — JSDoc/docstrings separated from the code they document.

**Prompt improvements to test:**

| Change                                                                          | Rationale                                                                  | Expected Impact |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------- |
| Add explicit examples of good/bad chunking                                      | Few-shot learning improves boundary accuracy dramatically for small models | HIGH            |
| Add "keep class methods with their class unless the class exceeds N lines" rule | Prevents method-level fragmentation                                        | MEDIUM          |
| Add "attach leading comments/docstrings to the code they document" rule         | Prevents orphaned documentation chunks                                     | MEDIUM          |
| Add "minimum chunk size: 5 lines" constraint                                    | Prevents trivially small chunks (single-line exports as their own chunk)   | LOW-MEDIUM      |
| Restructure prompt: rules first, then code (not interleaved)                    | LLMs attend to prompt structure; rules at top are followed more reliably   | LOW             |

**Testing methodology:**

1. Select 10-20 representative files (mix of sizes, patterns: small util, large class, config, test, mixed)
2. Index with current prompt → benchmark
3. Change one prompt aspect → re-index same files → benchmark
4. Compare MRR delta + manually inspect chunk quality
5. Iterate until MRR improvement plateaus

### 2. Prompt Engineering: Summary Quality

**What makes a good chunk summary for embedding:**

- **Captures intent:** "Validates JWT tokens and extracts user claims for authentication middleware" (GOOD)
- **Avoids syntax:** "Function validateJwt that takes token parameter and returns Promise<UserClaims>" (BAD — this is what the code vector is for)
- **Mentions domain concepts:** "authentication", "middleware", "user session" (GOOD — matches natural language queries)
- **Appropriate length:** 1-3 sentences, 30-150 words (too short = underspecified embedding, too long = diluted embedding)

**Prompt additions for summary quality:**

```
Summary guidelines:
- Describe WHAT the code accomplishes and WHY, not HOW it's implemented
- Use domain terminology that a developer would search for
- Do NOT repeat function/class names verbatim — describe their purpose
- Include the broader context: "part of the authentication flow" or "used during build process"
- Each summary should be 1-3 sentences (30-150 words)
```

### 3. Score-Based Result Filtering

**The core problem:**

| Search Mode             | Score Type        | Score Range             | Current Threshold | Problem                                                             |
| ----------------------- | ----------------- | ----------------------- | ----------------- | ------------------------------------------------------------------- |
| Dense-only (cosine)     | Cosine similarity | 0.0 – 1.0               | 0.3               | Reasonable but may be too aggressive for short queries              |
| Hybrid (prefetch + RRF) | RRF fusion score  | ~0.0 – 0.1 (rank-based) | 0.3               | **Filters out ALL results** — RRF scores are rank-based, not cosine |
| Multi-collection RRF    | RRF of RRF scores | Even lower range        | 0.3               | Same problem compounded                                             |

**Fix: mode-aware thresholds**

```typescript
interface ScoreThresholdConfig {
  dense: number; // Default: 0.3 (cosine similarity)
  hybrid: number; // Default: 0.0 (RRF scores are not cosine — rely on limit)
  multiCollection: number; // Default: 0.0 (double-RRF scores)
}
```

**Key insight from Qdrant docs:** When using `query: { fusion: 'rrf' }`, the returned scores are NOT cosine similarities. They're reciprocal rank values. Applying a cosine-style threshold to RRF scores is a bug, not a feature. For hybrid/RRF queries, control result count via `limit` only.

**Additional filtering strategies to consider:**

| Strategy                      | How It Works                                                            | When to Use                                                          |
| ----------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Score gap detection**       | If there's a large drop between result N and N+1 scores, cut at the gap | When results have a natural "relevance cliff"                        |
| **Relative threshold**        | Filter results scoring < X% of top result                               | Adapts to query difficulty — hard queries have lower absolute scores |
| **Top-K only (no threshold)** | Return exactly K results regardless of score                            | Simplest. Works well when K is small (5-10)                          |
| **Score normalization**       | Normalize scores to [0,1] before thresholding                           | Makes thresholds meaningful across search modes                      |

**Recommendation:** Start with mode-aware thresholds (fix the RRF bug). Then add score gap detection as a differentiator — it's the most principled approach for variable-quality queries.

### 4. Dashboard Tuning Views

**Chunking Quality Inspector:**

```
┌─────────────────────────────────────────────────┐
│ Chunking Inspector                               │
│ File: src/auth/middleware.ts                      │
│ Strategy: LLM (prompt v3)    Chunks: 5           │
├──────────────────┬──────────────────────────────┤
│ Source Code       │ Chunk Details                │
│                  │                              │
│ 1: import {...}  │ ┌─ Chunk 1 (lines 1-8) ──┐  │
│ 2: import {...}  │ │ Summary: "Import block   │  │
│ ...              │ │ for auth dependencies"   │  │
│ 8: import {...}  │ │ Quality: ★★★☆ (3/4)     │  │
│                  │ └─────────────────────────┘  │
│ 9:               │                              │
│ 10: export async │ ┌─ Chunk 2 (lines 10-45) ─┐ │
│ 11:   function   │ │ Summary: "JWT validation │  │
│ ...              │ │ middleware that verifies  │  │
│ 45: }            │ │ tokens and attaches user" │  │
│                  │ │ Quality: ★★★★ (4/4)     │  │
│                  │ └─────────────────────────┘  │
│ ⚠ Gap: line 9   │                              │
│   not covered    │                              │
└──────────────────┴──────────────────────────────┘
```

**Filtering Effectiveness View:**

```
┌─────────────────────────────────────────────────┐
│ Query: "JWT authentication middleware"           │
│ Mode: Hybrid  Threshold: 0.3                     │
├─────────────────────────────────────────────────┤
│ ✅ RETURNED (5 results)                          │
│ ┌─ 0.92  auth/middleware.ts:10-45  [LLM] ─────┐│
│ ┌─ 0.85  auth/jwt-validator.ts:1-30 [AST] ────┐│
│ ┌─ 0.71  auth/session.ts:22-58 [LLM] ─────────┐│
│ ┌─ 0.55  auth/types.ts:1-20 [AST] ────────────┐│
│ ┌─ 0.41  middleware/index.ts:5-15 [AST] ───────┐│
├─────────────────────────────────────────────────┤
│ ❌ FILTERED (3 near-misses, scores 0.20-0.29)   │
│ ┌─ 0.29  routes/protected.ts:10-25 ───────────┐│
│ ┌─ 0.24  config/auth-config.ts:1-15 ──────────┐│
│ ┌─ 0.21  tests/auth.test.ts:5-30 ─────────────┐│
├─────────────────────────────────────────────────┤
│ 📊 Score Distribution                           │
│ [histogram showing score spread of top 50]       │
│ ───── threshold line at 0.3 ─────               │
└─────────────────────────────────────────────────┘
```

---

## MVP Recommendation

### Phase 1: Foundation (enables everything else)

1. **Prompt versioning** — hash-based version tracking, stored with collection metadata
2. **Chunk overlap/gap detection** — post-processing validation in `llm-chunker.ts`
3. **Fix RRF score threshold bug** — mode-aware thresholds (dense: 0.3, hybrid: 0.0)
4. **Baseline benchmark** — establish current MRR before any changes

### Phase 2: Prompt Tuning (the main MRR lever)

5. **Prompt boundary improvements** — few-shot examples, min chunk size, class grouping rules
6. **Prompt summary improvements** — intent-focused guidelines, domain terminology emphasis
7. **Summary quality scoring** — heuristic checks for each chunk summary
8. **Prompt A/B testing workflow** — CLI + benchmark comparison

### Phase 3: Dashboard Visibility

9. **Chunking quality inspector** — view chunks alongside source code
10. **Score distribution analysis** — histogram of candidate scores
11. **Filtering effectiveness view** — returned vs filtered results
12. **Prompt version comparison** — link benchmark results to prompt versions

**Defer:**

- **Score gap detection** — Interesting but premature. Fix the threshold bug first, measure impact.
- **Cross-encoder reranking** — v1.3+. Focus on first-stage quality.
- **Dynamic auto-tuning** — Need more data before automation makes sense.

---

## Feature Prioritization Matrix

| Feature                          | MRR Impact                               | Implementation Cost | Priority |
| -------------------------------- | ---------------------------------------- | ------------------- | -------- |
| Fix RRF score threshold bug      | HIGH (currently filtering valid results) | LOW                 | **P0**   |
| Prompt boundary improvements     | HIGH (better chunks = better embeddings) | MEDIUM              | **P1**   |
| Prompt summary improvements      | HIGH (summary = text vector content)     | LOW-MEDIUM          | **P1**   |
| Prompt versioning                | MEDIUM (enables systematic iteration)    | LOW-MEDIUM          | **P1**   |
| Chunk overlap/gap detection      | MEDIUM (catches LLM failures)            | LOW                 | **P1**   |
| Baseline + validation benchmarks | Foundational                             | LOW                 | **P1**   |
| Chunking quality inspector       | HIGH (makes prompt tuning 3x faster)     | MEDIUM-HIGH         | **P2**   |
| Summary quality scoring          | LOW-MEDIUM (heuristic feedback)          | LOW                 | **P2**   |
| Prompt A/B testing workflow      | MEDIUM (systematic comparison)           | MEDIUM              | **P2**   |
| Score distribution analysis      | MEDIUM (informs threshold tuning)        | LOW-MEDIUM          | **P2**   |
| Filtering effectiveness view     | MEDIUM (noise/signal visibility)         | MEDIUM              | **P2**   |
| Dynamic threshold per mode       | LOW-MEDIUM (refinement after bug fix)    | LOW                 | **P3**   |
| Score gap detection              | LOW (advanced filtering)                 | MEDIUM              | **P3**   |

**Priority key:**

- **P0:** Fix immediately — active bug hurting results
- **P1:** Core v1.2 — directly drives MRR improvement
- **P2:** Visibility — makes tuning faster and more informed
- **P3:** Refinement — after core improvements plateau

---

## Sources

- **Qdrant docs (HIGH):** RRF fusion returns rank-based scores, not cosine — threshold behavior differs. Context7 `/llmstxt/qdrant_tech_llms-full_txt`
- **Existing codebase (HIGH):** `prompt.ts`, `llm-chunker.ts`, `search-engine.ts`, `multi-collection-search-engine.ts` — direct code inspection
- **MRR-IMPROVEMENT-RESEARCH.md (HIGH):** Prior research on retrieval quality improvements, score threshold tuning, textify pattern
- **v1.1 FEATURES.md (HIGH):** Prior feature research establishing existing capabilities
- **PROJECT.md (HIGH):** v1.2 scope definition, MRR > 0.7 target, feature list

---

_Feature research for: ia-framework v1.2 — Chunking Tuning & Retrieval Quality_
_Researched: 2026-04-22_
