---
phase: 43-per-repo-indexing
plan: 02
subsystem: cli
tags: [cli, indexing, multi-repo, qdrant, per-repo]

requires:
  - phase: 43-per-repo-indexing
    provides: ChunkPayload.repoId field, IndexingConfig.repoId, per-repo incremental state
  - phase: 42-config-repo-registry
    provides: RepoRegistry class with getRepos()/getRepo()
provides:
  - CLI --repo flag for scoped indexing
  - Per-repo sequential indexing loop
  - Scoped force-delete (--force + --repo deletes only that repo's chunks)
  - Backward-compat warning for legacy chunks without repoId
affects: [mcp-server, retrieval, dashboard]

tech-stack:
  added: []
  patterns: [per-repo-loop, scoped-force-delete, backward-compat-warning]

key-files:
  created: []
  modified:
    - packages/cli/src/commands/index.command.ts

key-decisions:
  - 'Moved Maven module graph building inside per-repo loop (each repo gets its own graph)'
  - 'Used Qdrant is_null filter for backward-compat orphan detection'

patterns-established:
  - 'Per-repo loop: iterate RepoRegistry entries, pass repo.path and repo.name to each subsystem'

requirements-completed: [INDX-02, INDX-03]

duration: 4min
completed: 2026-05-22
---

# Phase 43 Plan 02: Per-Repo CLI Indexing Summary

**CLI `--repo <name>` flag with per-repo sequential indexing, scoped force-delete, and backward-compat warning for legacy chunks**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-22T13:48:38Z
- **Completed:** 2026-05-22T13:53:05Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `-r/--repo <name>` CLI flag to scope indexing to a single repo
- Implemented per-repo sequential loop with RepoRegistry validation
- Scoped force-delete only removes chunks matching the specified repo's repoId
- Backward-compat warning alerts users about legacy chunks lacking repoId

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --repo flag and per-repo indexing loop to CLI** - `bf0f904` (feat)
2. **Task 2: Add backward-compat warning for missing repoId chunks** - `8410ebb` (feat)

## Files Created/Modified

- `packages/cli/src/commands/index.command.ts` - Added --repo flag, per-repo loop, scoped delete, backward-compat warning

## Decisions Made

- Moved Maven module graph building inside the per-repo loop so each repo independently detects its Maven structure
- Used Qdrant `is_null` filter (via `must_not`) to count chunks without repoId for backward-compat warning

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 43 complete — all per-repo indexing functionality implemented
- CLI supports --repo for scoped indexing, --force for full re-index
- Ready for verification and next milestone work

---

_Phase: 43-per-repo-indexing_
_Completed: 2026-05-22_
