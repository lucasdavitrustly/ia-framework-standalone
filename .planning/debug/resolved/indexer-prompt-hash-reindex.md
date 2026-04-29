---
status: resolved
trigger: 'indexer-prompt-hash-reindex'
created: 2026-04-23T00:00:00Z
updated: 2026-04-23T00:00:00Z
---

## Current Focus

hypothesis: IndexingState lacks promptContentHash — pipeline only checks git commit for incremental skip
test: confirmed by reading incremental.ts and pipeline.ts
expecting: adding promptContentHash to state + checking it in pipeline will fix
next_action: implement fix

## Symptoms

expected: When LLM chunking prompt changes, re-index should trigger
actual: Indexer skips all files because git commit hasn't changed
errors: Silent "Indexed 0 chunks from 0 files"
reproduction: Index with llm strategy, change prompt, rebuild, delete cache, re-index → 0 files
started: Always been this way

## Eliminated

(none)

## Evidence

- timestamp: 2026-04-23
  checked: incremental.ts IndexingState interface
  found: Only stores lastIndexedCommit, indexedAt, embeddingModel — no prompt hash
  implication: Root cause confirmed

- timestamp: 2026-04-23
  checked: pipeline.ts lines 191-210
  found: Incremental check only uses getLastIndexedCommit + getChangedFiles
  implication: No mechanism to detect prompt changes

## Resolution

root_cause: IndexingState in incremental.ts doesn't track promptContentHash. Pipeline incremental logic only checks git commit hash, so prompt changes are invisible.
fix: Add promptContentHash to IndexingState, expose getter, pass from pipeline when LLM strategy is used, force full re-index on mismatch.
verification: All 110 pipeline tests pass, including 6 dedicated prompt-hash tests (forces full re-index on mismatch, skips when matches, AST strategy unaffected, hash saved/not-saved correctly, null hash = first-time)
files_changed: [packages/indexer/src/incremental.ts, packages/indexer/src/pipeline.ts, packages/indexer/src/strategies/prompt.ts]
