---
status: complete
phase: 43-per-repo-indexing
source: [43-01-SUMMARY.md, 43-02-SUMMARY.md]
started: 2026-05-22T14:10:00Z
updated: 2026-05-22T14:18:00Z
---

## Current Test

[testing complete]

## Tests

### 1. --repo flag scopes indexing to single repo

expected: Run `pnpm ia-framework index --repo <name>` with a valid repo name. Only that repo is indexed — log output shows processing only the specified repo's files, not all configured repos.
result: pass

### 2. Invalid --repo name rejected

expected: Run `pnpm ia-framework index --repo nonexistent-name`. CLI exits with an error message indicating the repo name is not found in the registry (not a silent failure or full index).
result: pass

### 3. Scoped force-delete with --repo + --force

expected: Run `pnpm ia-framework index --repo <name> --force`. Only chunks belonging to that repo are deleted and re-indexed. Chunks from other repos remain untouched in Qdrant.
result: pass

### 4. Backward-compat warning for legacy chunks

expected: If you have chunks indexed before phase 43 (without repoId), running `pnpm ia-framework index` shows a warning about legacy chunks lacking repoId. The warning suggests re-indexing with --force.
result: pass

### 5. repoId present in newly indexed chunks

expected: After indexing with --repo, query Qdrant directly (or check via MCP search). Newly indexed chunks carry a `repoId` field in their payload matching the repo name used.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
