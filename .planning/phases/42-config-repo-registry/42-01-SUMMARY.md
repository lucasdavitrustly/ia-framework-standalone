---
phase: 42-config-repo-registry
plan: 01
subsystem: config
tags: [zod, typescript, multi-repo, registry, schema]

requires: []
provides:
  - RepoEntrySchema in packages/core/src/config/schema.ts
  - Updated ProjectConfigSchema with mutual exclusion refine
  - RepoEntry interface in packages/core/src/types/index.ts
  - RepoRegistry class in packages/core/src/config/registry.ts
  - loadConfig still works with both legacy and multi-repo formats
affects: [43-indexer-multi-repo, 44-search-multi-repo, 45-cross-repo-graph]

tech-stack:
  added: []
  patterns:
    - 'Multi-repo config: repos[] array OR targetProjectPath (never both)'
    - 'RepoRegistry.fromConfig(config, configDir) — normalize at construction'
    - 'toKebabCase basename derivation for repo names'

key-files:
  created:
    - packages/core/src/config/registry.ts
    - packages/core/src/config/registry.test.ts
  modified:
    - packages/core/src/config/schema.ts
    - packages/core/src/config/schema.test.ts
    - packages/core/src/types/index.ts
    - packages/core/src/index.ts

key-decisions:
  - 'Zod .refine() for mutual exclusion (not z.union) — simpler error messages'
  - 'RepoRegistry constructed separately from loadConfig — config stays as plain data'
  - 'Name auto-derived from path basename via toKebabCase — explicit name overrides'

patterns-established:
  - 'Schema-first: Zod schema + TypeScript interface always in sync'
  - 'Registry pattern: immutable Map<name, entry> constructed at config load time'

requirements-completed:
  - CONF-01
  - CONF-04

duration: 5min
completed: 2026-05-21
---

# Phase 42 Plan 01: Config Repo Registry Summary

**Zod RepoEntrySchema + RepoRegistry class enabling multi-repo `repos[]` config alongside backward-compatible `targetProjectPath` legacy format**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-21T19:37:47Z
- **Completed:** 2026-05-21T19:42:59Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- RepoEntrySchema validates repo entries (path, optional name in kebab-case, provides, profile)
- ProjectConfigSchema updated with `repos[]` support and `.refine()` mutual exclusion guard
- RepoEntry interface and updated ProjectConfig (both fields optional) in types/index.ts
- RepoRegistry class with `fromConfig`, `getRepos()`, `getRepo()`, `size` — handles both config formats

## Task Commits

1. **Task 1 RED: Schema tests** - `a8f1500` (test)
2. **Task 1 GREEN: Schema + types implementation** - `bae8944` (feat)
3. **Task 2 RED: Registry tests** - `fa553b7` (test)
4. **Task 2 GREEN: Registry implementation** - `f82e9f7` (feat)

## Files Created/Modified

- `packages/core/src/config/schema.ts` - Added RepoEntrySchema, updated ProjectConfigSchema with repos[] and refine
- `packages/core/src/config/schema.test.ts` - Added 9 new tests for RepoEntry and multi-repo formats
- `packages/core/src/types/index.ts` - Added RepoEntry interface, made ProjectConfig.targetProjectPath optional, added repos?
- `packages/core/src/config/registry.ts` - New RepoRegistry class
- `packages/core/src/config/registry.test.ts` - 13 tests covering all registry behaviors
- `packages/core/src/index.ts` - Exports RepoRegistry and RepoEntry

## Decisions Made

- Used `.refine()` on ProjectConfigSchema rather than `z.union` — simpler error messages, single object shape
- RepoRegistry is separate from loadConfig return value — config stays plain data, registry built by consumers
- Name derivation via `toKebabCase(basename(path))` at construction time, explicit name overrides

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing test failures in schema.test.ts (maxTokensPerCall default behavior mismatch) — 2 tests failing before this plan started. Out of scope; tracked separately.

## Next Phase Readiness

- RepoRegistry data layer complete — ready for Phase 43 (indexer multi-repo) which will use `RepoRegistry.fromConfig()` to get the list of repos to index

---

_Phase: 42-config-repo-registry_
_Completed: 2026-05-21_
