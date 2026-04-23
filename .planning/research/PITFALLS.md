# Domain Pitfalls — v1.2 Milestone

**Domain:** LLM chunking prompt tuning, score-based result filtering, and RAG retrieval quality optimization in an existing system
**Researched:** 2026-04-22
**Confidence:** HIGH (existing system analysis, RAG engineering patterns)

> **Context:** The system already has working LLM chunking (llama3.2 via Ollama), AST chunking, hybrid BM25+dense with RRF fusion, multi-collection search, MRR benchmarks (Hit@K, MRR), and a dashboard with analytics. Current MRR is below 0.7 target. These pitfalls cover mistakes when TUNING the existing system, not building it.

---

## Critical Pitfalls

Mistakes that waste weeks of tuning effort or actively degrade retrieval quality.

---

### Pitfall 1: Tuning Without a Stable Benchmark Baseline

**What goes wrong:**
You start tweaking prompts and filters before establishing a frozen, reproducible baseline MRR. Every change looks like an improvement because you're comparing against a moving target — maybe the Ollama model loaded differently, maybe Qdrant was mid-compaction, maybe the benchmark corpus changed between runs.

**Why it happens:**
Eagerness to improve. The current MRR < 0.7 feels like an obvious problem to fix, so you jump straight to prompt changes. Non-determinism in LLM chunking (temperature > 0, different Ollama load states) means repeated runs on the same prompt produce different chunks, different embeddings, different MRR.

**Consequences:**

- You can't tell if prompt A is actually better than prompt B
- You ship a "better" prompt that regresses on queries you didn't notice
- Weeks of A/B testing produce noise, not signal

**Prevention:**

- **Freeze the corpus first.** Lock the 30-query benchmark corpus before any tuning begins. No additions or modifications during a tuning cycle.
- **Set temperature to 0** for chunking during benchmark runs. Accept slightly worse average quality for reproducibility.
- **Run each configuration 3x** and report mean MRR. If variance > 0.02, you have a reproducibility problem to fix before tuning.
- **Store the full benchmark artifact** (per-query scores, not just aggregate MRR) so you can diff which queries improved/regressed.

**Detection:**

- MRR swings > 0.03 between identical runs = reproducibility problem
- You can't answer "which specific queries did this change improve?"

**Phase to address:** First phase — establish baseline before any tuning work begins.

---

### Pitfall 2: Prompt Engineering Without Per-Query Diagnosis

**What goes wrong:**
You iterate on the LLM chunking prompt globally — "make summaries more detailed" or "include more context" — without understanding WHY specific queries fail. You optimize the average while ignoring that MRR is dragged down by a few catastrophic misses that need targeted fixes.

**Why it happens:**
Aggregate MRR hides the distribution. An MRR of 0.55 could mean every query ranks at position 2 (uniform mediocre), OR 20 queries hit at position 1 and 10 queries completely miss (bimodal). These require completely different fixes.

**Consequences:**

- Global prompt changes improve easy queries (already scoring well) while doing nothing for hard queries (the ones dragging MRR down)
- You hit a ceiling at ~0.6 MRR and can't figure out why
- Prompt becomes bloated with instructions that don't help

**Prevention:**

- **Start with per-query failure analysis.** For every query with rank > 3 or miss, manually inspect: What chunk SHOULD have been returned? What chunk WAS returned? Why did the wrong chunk score higher?
- **Categorize failures:** (a) chunk boundary wrong — the answer spans two chunks, (b) summary doesn't mention the right concepts, (c) embedding similarity is low despite good summary, (d) BM25 keyword mismatch, (e) correct chunk exists but scores below threshold
- **Target prompt changes at specific failure categories**, not at "make it better generally"
- **Track per-query MRR in a table**, not just aggregate

**Detection:**

- You've changed the prompt 5+ times but MRR hasn't moved more than 0.02
- You can't explain why a specific query fails

**Phase to address:** Prompt engineering phase — build the diagnostic tooling before changing prompts.

---

### Pitfall 3: Score Threshold Filtering That Silently Drops Correct Results

**What goes wrong:**
You add score-based filtering (e.g., "drop results below 0.3") to reduce noise, and MRR drops instead of improving. The threshold removes both noise AND correct results that happen to have lower similarity scores. Worse: the threshold that works for dense search doesn't work for BM25, and neither works well after RRF fusion because RRF scores are on a completely different scale.

**Why it happens:**
Similarity scores are not probabilities. A cosine similarity of 0.4 might be excellent for one embedding model and terrible for another. BM25 scores are unbounded. RRF scores (1/(k+rank)) are always small fractions. A single threshold across all these signals is mathematically wrong.

**Consequences:**

- Hard queries (where the correct result naturally has a lower score) get zero results after filtering
- MRR drops on the long tail while precision on easy queries improves — net negative
- Different embedding models need different thresholds, creating a maintenance nightmare

**Prevention:**

- **Never set a global threshold without measuring Hit@K impact.** Compare Hit@10 before and after filtering. If Hit@10 drops, you're killing recall.
- **Use relative thresholds, not absolute.** E.g., "keep results within 80% of the top score" rather than "drop below 0.3". This adapts to query difficulty.
- **Apply different thresholds per signal source.** Dense, BM25, and RRF fusion scores need independent treatment. Filter BEFORE fusion if possible, not after.
- **Measure the "empty result" rate.** If > 5% of benchmark queries return zero results after filtering, the threshold is too aggressive.
- **Consider rank-based cutoff instead of score-based.** "Return top 5" is more robust than "return everything above 0.3" because it guarantees results.

**Detection:**

- Hit@10 drops after adding filtering (recall regression)
- Benchmark queries that previously ranked at position 7-10 now return nothing
- "No results found" appearing in dashboard search

**Phase to address:** Score filtering phase — implement with kill switch and A/B comparison.

---

### Pitfall 4: Overfitting Prompts to the Benchmark Corpus

**What goes wrong:**
You tune the LLM chunking prompt until MRR hits 0.7+ on the 30-query corpus, then discover it performs poorly on real developer queries. The prompt was optimized for the specific patterns in the benchmark, not for general code retrieval quality.

**Why it happens:**
30 queries is a small corpus. With enough prompt iterations, you can overfit to it — especially if the queries cluster around certain code patterns (e.g., lots of "find the function that..." but no "how does module X work?" queries).

**Consequences:**

- False confidence in retrieval quality
- Real-world MRR is significantly lower than benchmark MRR
- Developers lose trust in the tool

**Prevention:**

- **Hold out 20% of the corpus** (6 queries) as a validation set. Never look at validation set scores during tuning. Only check at the end.
- **Add new "challenge queries" periodically** — queries that represent real developer patterns you've seen fail in practice.
- **Diverse query types in the corpus:** identifier lookup, conceptual search, cross-module queries, "how does X work", error-related searches. If the corpus is dominated by one type, add more.
- **Spot-check manually.** After prompt changes, try 5 ad-hoc queries in the dashboard search and verify results make sense.

**Detection:**

- Benchmark MRR is 0.7+ but developers complain results aren't relevant
- Validation set MRR is significantly lower than training set MRR
- Dashboard search quality doesn't match benchmark numbers

**Phase to address:** Throughout — maintain holdout discipline from the start.

---

## Moderate Pitfalls

### Pitfall 5: Chunk Boundary Changes Invalidate Existing Embeddings

**What goes wrong:**
You improve the chunking prompt so it produces better boundaries (e.g., keeping related functions together). But the old embeddings in Qdrant were generated from different chunk boundaries. You now have a mix of old-boundary and new-boundary chunks, or worse, you re-index and all your benchmark baselines are invalid because the chunks changed.

**Prevention:**

- **Always re-index fully** after prompt changes. No incremental updates when chunk boundaries change.
- **Version your chunking prompts.** Store the prompt hash or version in Qdrant payload metadata. This lets you filter or identify stale chunks.
- **Re-run benchmarks immediately after re-index.** The old MRR numbers are meaningless against new chunks.
- **Keep the old collection alive** until the new one benchmarks better. Don't delete-then-recreate.

**Phase to address:** Prompt engineering phase — build versioned collections.

---

### Pitfall 6: Summary Quality vs. Summary Length Tradeoff

**What goes wrong:**
You make the LLM generate longer, more detailed summaries thinking more context = better embeddings. But longer summaries dilute the embedding — the key concepts get averaged with filler words, and similarity scores drop for targeted queries.

**Prevention:**

- **Benchmark short summaries (1-2 sentences) against long ones (paragraph).** Shorter often wins for embedding similarity.
- **Focus summaries on WHAT the code does and WHY, not HOW.** Implementation details belong in the code vector, not the text vector.
- **Measure embedding similarity directly.** For a known good query-chunk pair, check if the summary change increases or decreases cosine similarity.

**Phase to address:** Prompt engineering phase.

---

### Pitfall 7: RRF Fusion Constant (k=60) Never Tuned

**What goes wrong:**
RRF uses the formula `1/(k + rank)`. The constant `k` (commonly 60) controls how much weight goes to top-ranked vs. lower-ranked results. The default k=60 is from web search literature and may not be optimal for code search where you have fewer candidates and want to weight the top result more heavily.

**Prevention:**

- **Sweep k values** (10, 30, 60, 100) in benchmark and measure MRR at each. Lower k = more weight to rank 1; higher k = more uniform weighting.
- **This is a quick win** — no re-indexing, just a parameter change in the fusion logic.

**Phase to address:** Score filtering phase — include in parameter sweep.

---

### Pitfall 8: Dashboard Tuning Views That Show Aggregates Instead of Distributions

**What goes wrong:**
You build dashboard views that show "MRR: 0.62" and "Mean Score: 0.41" but these single numbers hide the shape of the data. You can't see that 8 queries score perfectly and 5 queries completely fail, or that score distributions are bimodal.

**Prevention:**

- **Show per-query breakdown** — a table/heatmap of every query and its rank, not just the mean.
- **Show score histograms** — distribution of similarity scores across results, not just mean.
- **Show before/after diff** — when comparing configurations, highlight which queries improved and which regressed.
- **Show the "worst 5 queries"** prominently — these are where MRR improvement lives.

**Phase to address:** Dashboard tuning views phase.

---

### Pitfall 9: Tuning LLM Prompts While Ignoring AST Chunking Quality

**What goes wrong:**
All tuning effort goes into LLM chunking prompts because that's the new feature. Meanwhile, AST chunking (which is faster and covers all files) has its own quality issues — maybe it splits classes from their methods, or misses module-level constants. Since both collections are RRF-merged, poor AST chunks drag down overall MRR even if LLM chunks are perfect.

**Prevention:**

- **Benchmark each collection independently** before measuring the merged result. If AST MRR is 0.4 and LLM MRR is 0.7, fixing AST chunking might lift merged MRR more than further LLM prompt tuning.
- **The dashboard should show per-collection metrics**, not just merged.

**Phase to address:** Benchmark validation phase — add per-collection measurement.

---

## Minor Pitfalls

### Pitfall 10: Prompt Changes Without Version Control

**What goes wrong:**
You iterate on the chunking prompt in code, forget what the previous version was, can't reproduce last week's MRR number.

**Prevention:**

- Store prompts as versioned files or constants with clear naming (e.g., `CHUNKING_PROMPT_V3`).
- Log which prompt version was used in each benchmark run's metadata.

---

### Pitfall 11: Ignoring Ollama Model Quantization Effects on Chunking Quality

**What goes wrong:**
llama3.2 at Q4_K_M quantization produces different summaries than Q8_0. You tune prompts against one quantization level, someone runs with a different one, and quality differs.

**Prevention:**

- Pin the exact model tag (including quantization) in project config.
- Log the model tag in benchmark metadata.

---

### Pitfall 12: Measuring Only MRR, Ignoring Result Diversity

**What goes wrong:**
Top-5 results are all chunks from the same file (high similarity to each other). MRR looks good because the correct file is ranked #1, but the developer gets no cross-file context.

**Prevention:**

- Add a diversity metric (e.g., unique files in top-5) alongside MRR.
- Consider MMR (Maximal Marginal Relevance) reranking that penalizes redundancy.

---

## Phase-Specific Warnings

| Phase Topic            | Likely Pitfall                                                | Mitigation                                     |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| Baseline establishment | Not freezing corpus and getting reproducible runs (Pitfall 1) | Temperature=0, 3x runs, freeze corpus          |
| Prompt engineering     | Global prompt changes without per-query diagnosis (Pitfall 2) | Build failure analysis tooling first           |
| Prompt engineering     | Overfitting to 30-query corpus (Pitfall 4)                    | Hold out validation set, diverse query types   |
| Prompt engineering     | Forgetting to re-index after prompt changes (Pitfall 5)       | Version prompts, keep old collection alive     |
| Score filtering        | Threshold that kills recall (Pitfall 3)                       | Relative thresholds, measure Hit@K impact      |
| Score filtering        | RRF k constant untuned (Pitfall 7)                            | Parameter sweep, quick win                     |
| Dashboard tuning views | Aggregate-only display (Pitfall 8)                            | Per-query breakdown, score histograms, worst-5 |
| All phases             | Ignoring AST collection quality (Pitfall 9)                   | Per-collection benchmarks                      |

## Sources

- Existing system analysis: `.planning/PROJECT.md`, `.planning/research/MRR-IMPROVEMENT-RESEARCH.md`
- RRF fusion: Cormack, Clarke & Buettcher (2009) — k=60 default, varies by domain
- RAG filtering patterns: common engineering practice across Qdrant and vector search implementations
- Benchmark methodology: standard IR evaluation (holdout sets, reproducibility requirements)
- Confidence: HIGH for system-specific pitfalls (based on known architecture), MEDIUM for optimal parameter values (domain-dependent)
