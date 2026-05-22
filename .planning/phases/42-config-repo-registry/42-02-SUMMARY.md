---
phase: 42-config-repo-registry
plan: 02
subsystem: config
tags: [detection, multi-repo, typescript, java, python, pnpm-workspaces]

requires:
  - phase: 42-config-repo-registry plan 01
    provides: RepoRegistry, RepoEntry, ProjectProfile types

provides:
  - detectRepoProfile: heuristic per-repo language/framework/tooling detection
  - detectRepoProvides: package name extraction from manifests
  - RepoRegistry.detect(): populates all entries with detected profile/provides
  - RepoRegistry.toJSON(): serializes registry back to project.json format

affects: [42-config-repo-registry, 43-indexer-multi-repo, 45-cross-repo-graph]

tech-stack:
  added: []
  patterns:
    - 'File-existence-based heuristic detection (no external parsers)'
    - 'pnpm-workspace.yaml simple line parsing for monorepo support'
    - 'D-13 pattern: return undefined/[] for non-existent paths'

key-files:
  created:
    - packages/core/src/config/detector.ts
    - packages/core/src/config/detector.test.ts
  modified:
    - packages/core/src/config/registry.ts
    - packages/core/src/config/registry.test.ts
    - packages/core/src/index.ts

key-decisions:
  - 'Used file-existence heuristics (no YAML/XML parsers) — simpler, fewer deps'
  - 'pnpm-workspace.yaml parsed with simple line-by-line regex, not a full YAML parser'
  - 'detect() is non-destructive: only sets fields if detection succeeds'

patterns-established:
  - 'Detector returns undefined/[] (not throws) for missing paths (D-13)'
  - 'TDD: RED commit of test file, GREEN commit of implementation, Task 2 in standard mode'

requirements-completed:
  - CONF-02
  - CONF-03

duration: 3min
completed: 2026-05-21
---

# Phase 42 Plan 02: Per-Repo Detection Summary

**Per-repo auto-detection of language/framework profile and provides field, wired into RepoRegistry with detect() and toJSON() methods**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-21T19:44:48Z
- **Completed:** 2026-05-21T19:47:36Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `detectRepoProfile()`: detects TypeScript/JS (with React/Next/Express/Hono, pnpm/yarn/npm, vitest/jest), Java (Maven), Python (pip/poetry)
- `detectRepoProvides()`: extracts package names from `package.json`, `pom.xml` artifactId, and all workspace packages via `pnpm-workspace.yaml`
- `RepoRegistry.detect()`: iterates all entries and populates `profile` + `provides`; non-existent paths skipped gracefully
- `RepoRegistry.toJSON()`: serializes registry back to `repos[]` format for persistence
- 13 detector tests + 4 registry integration tests — all pass

## Task Commits

1. **Task 1 RED: Add failing detector tests** - `704e28c` (test)
2. **Task 1 GREEN: Implement detectRepoProfile and detectRepoProvides** - `3a6dc17` (feat)
3. **Task 2: Wire detection into RepoRegistry** - `63343d8` (feat)

## Files Created/Modified

- `packages/core/src/config/detector.ts` - detectRepoProfile and detectRepoProvides functions
- `packages/core/src/config/detector.test.ts` - 13 tests covering all detection scenarios
- `packages/core/src/config/registry.ts` - Added detect() and toJSON() methods + detector import
- `packages/core/src/config/registry.test.ts` - Added 4 integration tests for detect() and toJSON()
- `packages/core/src/index.ts` - Exported detectRepoProfile and detectRepoProvides from barrel

## Decisions Made

- File-existence heuristics only — no YAML/XML parser dependencies. Simpler and sufficient for detection use cases.
- `pnpm-workspace.yaml` parsed with simple line-by-line regex (handles `packages/*` glob patterns). Full YAML parsing deemed unnecessary.
- `detect()` is non-destructive: only populates fields when detection succeeds; missing paths remain with undefined profile/provides.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CONF-02 and CONF-03 fulfilled: per-repo detection and provides auto-population working
- Phase 42 complete — both plans have SUMMARYs
- Ready for next phase planning

---

_Phase: 42-config-repo-registry_
_Completed: 2026-05-21_
