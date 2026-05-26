---
status: awaiting_human_verify
trigger: 'ia-framework index --force crashes with JavaScript heap OOM (~4GB) during ArrayPrototypeJoin'
created: 2026-05-25T00:00:00Z
updated: 2026-05-25T00:00:00Z
---

## Current Focus

hypothesis: vectorPoints array accumulates ALL embedded chunks (with full content + vectors) in memory before storing to Qdrant, causing unbounded memory growth
test: confirmed by reading pipeline.ts — vectorPoints grows unboundedly at line 410/184
expecting: fixing by upserting batches immediately after embedding instead of accumulating
next_action: refactor embedBatchWithRetry to upsert directly and remove vectorPoints accumulation

## Symptoms

expected: Indexing completes successfully for multiple repos
actual: Process crashes with "Reached heap limit Allocation failed - JavaScript heap out of memory" at ~4GB
errors: FATAL ERROR at ArrayPrototypeJoin during async file handle close callback. Stack shows allocation failure in young generation during Array.join().
reproduction: `ia-framework index --force` with 2 large repos configured
started: After multi-repo indexing capability was added

## Eliminated

## Evidence

- timestamp: 2026-05-25T00:01:00Z
  checked: pipeline.ts memory accumulation pattern
  found: |
  Line 310: `const allChunks: CodeChunk[] = []` accumulates ALL chunks for a repo
  Line 410: `const vectorPoints: VectorPoint[] = []` accumulates ALL vector points
  Line 184: `results.push(...)` inside embedBatchWithRetry pushes to shared vectorPoints
  Line 529: Qdrant upsert only happens AFTER all embedding completes
  Line 536: `enrichedForConcepts` creates ANOTHER copy of allChunks
  Memory holds simultaneously: allChunks (content) + vectorPoints (content AGAIN + vectors) + enrichedForConcepts (content AGAIN)
  implication: For large repos, 3x content in memory + vectors causes OOM. The .join() in stack trace is from computeTermFrequencySparseVector tokenizing large chunks while GC is under extreme pressure.

## Resolution

root_cause: pipeline.ts accumulates ALL vectorPoints in memory (each containing full source content + 2 float vectors + sparse vector) before upserting to Qdrant. Combined with allChunks and enrichedForConcepts, memory holds ~3x the full codebase content simultaneously, exceeding heap limit for large repos.
fix: Upsert batches to Qdrant immediately after embedding (streaming) instead of accumulating; null out allChunks content after call-chain extraction; avoid full copy for concept detection.
verification: pending
files_changed: [packages/indexer/src/pipeline.ts]
