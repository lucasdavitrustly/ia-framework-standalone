---
phase: quick-260407-gjl
plan: 01
task: update-readme-md-with-phase-11-mrr-optim
completed: 2026-04-07
commit: aea4bea
pr_url: https://github.com/rafaelmgoncalves/ia-framework/pull/15
---

# Quick Task 260407-gjl: Update README with Phase 11 MRR Optimizations — Summary

**One-liner:** Updated README with hybrid search tool, MRR-tuned thresholds, prose embeddings, and corpus CLI; opened v1.0 PR targeting main.

## What Was Changed in README

### 1. Recent Improvements section (top of list)

Added 4 new bullet points at the top of the Recent Improvements list:

- **Hybrid search (MRR-optimized)** — documents `search_codebase_hybrid` MCP tool with BM25 + RRF
- **MRR-tuned score threshold** — documents the 0.5 → 0.3 change with benchmark sweep evidence (MRR=0.50 at 0.3–0.5, 0.46 at 0.6)
- **Prose-description embeddings** — documents the structured description embedding approach
- **Corpus generator CLI** — documents `ia-framework benchmark init-corpus`

### 2. MCP Tools table (Step 8 — Connect to OpenCode)

Added `search_codebase_hybrid` row after `search_codebase`:

> `search_codebase_hybrid` | Hybrid BM25 + semantic search with RRF fusion — higher recall for exact-match queries

### 3. MCP Tools (Detailed) — new `### search_codebase_hybrid` subsection

Added full parameter table for the hybrid tool with `score_threshold` default of 0.3 and fallback note for older collections.

### 4. CLI Reference — `benchmark init-corpus` subsection

Added new CLI block after `benchmark compare` with all options:

- `--output`, `--count`, `--model`, `--config`
- Explains Ollama default (llama3.2 @ localhost:11434), probe behavior, and target project guard

### 5. Benchmark Corpus Limitations paragraph

Updated from fully-manual description to reflect `init-corpus` bootstrapping as a starting point with human review still required.

### 6. `search_codebase` parameter table — score_threshold default

Changed from `0.5` → `0.3` with note: "tuned via MRR benchmark sweep"

### 7. CLI search command — --threshold default

Changed from `(default: 0.5)` → `(default: 0.3; MRR-tuned)`

## Verification

```
grep -c "search_codebase_hybrid" README.md  → 3
grep -c "init-corpus" README.md             → 3
grep "0\.3" README.md                       → 5 lines (threshold refs)
gh pr list --state open                     → PR #15 OPEN
```

## Commit

| Commit    | Message                                                              |
| --------- | -------------------------------------------------------------------- |
| `aea4bea` | `docs: update README with Phase 11 MRR optimizations and corpus CLI` |

## PR

- **URL:** https://github.com/rafaelmgoncalves/ia-framework/pull/15
- **Title:** v1.0 complete: Phase 11 MRR optimizations, corpus CLI, and doc updates
- **Base:** main
- **Branch:** fix/readme-opencode-config-filename
- **Scope:** 36 commits covering Phase 11 MRR suite, corpus CLI, dashboard live updates, stop indexing, OpenCode config fix, and README updates

## Deviations from Plan

None — plan executed exactly as written.
