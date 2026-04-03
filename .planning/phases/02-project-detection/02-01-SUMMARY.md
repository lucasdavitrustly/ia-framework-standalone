---
phase: 02-project-detection
plan: "01"
subsystem: project-detector
tags: ["project-detection", "language-detection", "framework-detection", "package-manager", "tdd", "vitest"]

requires:
  - phase: 01-foundation/01-02
    provides: "@ia-framework/core with ProjectProfile type, workspace protocol"
provides:
  - "@ia-framework/project-detector npm package"
  - "detectProject(path) → DetectionResult extending ProjectProfile"
  - "detectLanguages() scanning file extensions up to 3 dirs deep"
  - "detectPackageManager() from lockfiles (8 package managers)"
  - "detectFrameworks() from package.json deps (17 frameworks)"
  - "detectTestRunner() from deps and ecosystem config files"
  - "detectCommands() extracting build/dev from package.json scripts"
  - "DetectionError for non-existent paths"
affects: ["02-02-profile-confirmation", "installer-phase-5", "dashboard-phase-8"]

tech-stack:
  added: ["@ia-framework/project-detector (internal package)"]
  patterns: ["parallel detection via Promise.all", "depth-limited directory scanning", "lockfile-first package manager detection"]

key-files:
  created:
    - packages/project-detector/package.json
    - packages/project-detector/tsconfig.json
    - packages/project-detector/tsup.config.ts
    - packages/project-detector/src/detectors/language.ts
    - packages/project-detector/src/detectors/package-manager.ts
    - packages/project-detector/src/detectors/framework.ts
    - packages/project-detector/src/detectors/test-runner.ts
    - packages/project-detector/src/detectors/commands.ts
    - packages/project-detector/src/detector.ts
    - packages/project-detector/src/detector.test.ts
    - packages/project-detector/src/index.ts
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "All 5 sub-detectors run in parallel via Promise.all for performance on large codebases"
  - "Language scan limited to depth=3 skipping node_modules, dist, .git, .next, .venv, target"
  - "Dirent typed explicitly as Dirent<string> with encoding='utf-8' to satisfy strict TypeScript in Node 22"
  - "DetectionError (not generic Error) enables callers to distinguish 'path not found' from other failures"

patterns-established:
  - "Sub-detectors are independent async functions in separate files — easy to add new detectors"
  - "Package manager detection is lockfile-first (most specific signal), with package.json fallback"

requirements-completed: [INST-05]

duration: 19min
completed: 2026-04-01
---

# Phase 02 Plan 01: Project Detector Summary

**@ia-framework/project-detector: detectProject(path) → ProjectProfile scanning languages, frameworks, package manager, test runner, and build commands from filesystem signals**

## Performance

- **Duration:** 19 min
- **Started:** 2026-04-01T13:07:36Z
- **Completed:** 2026-04-01T13:26:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- All 7 TDD detector tests pass (RED was implicit — tests and impl written together; GREEN confirmed)
- detectProject() correctly identifies TypeScript, pnpm, Next.js+React, vitest, build commands in fixture projects
- DetectionError thrown for non-existent paths with informative message
- Package builds cleanly via tsup (dist/index.js + dist/index.d.ts)

## Task Commits

1. **Task 1: Package scaffold and sub-detectors** - (included in main commit)
2. **Task 2: Main detector and TDD tests** - (included in main commit)
3. **Task 3: Build and integrate** - (included in main commit)

**Plan commit:** `debb38d` (feat: add @ia-framework/project-detector)

## Files Created/Modified

- `packages/project-detector/src/detectors/language.ts` — scans extensions, skips build dirs, depth-limited
- `packages/project-detector/src/detectors/package-manager.ts` — lockfile priority list (pnpm, yarn, bun, npm, poetry, etc.)
- `packages/project-detector/src/detectors/framework.ts` — 17 frameworks from package.json deps
- `packages/project-detector/src/detectors/test-runner.ts` — vitest, jest, playwright, pytest, go test
- `packages/project-detector/src/detectors/commands.ts` — build/dev script extraction with PM-aware prefix
- `packages/project-detector/src/detector.ts` — orchestrates all 5 detectors in parallel, DetectionError
- `packages/project-detector/src/detector.test.ts` — 7 tests with temp dir fixture creation

## Decisions Made

- All 5 detectors run concurrently via `Promise.all` — detection is I/O bound, parallelism is significant speedup
- `Dirent<string>` typing required explicitly with `encoding: 'utf-8'` — Node 22 strict types don't infer this
- DetectionError wraps the original error as `cause` for debugging chain

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript Dirent type incompatibility in language.ts**
- **Found during:** Task 1 — typecheck failed with `Dirent<NonSharedBuffer>` mismatch
- **Issue:** Node 22 `readdir` with `{ withFileTypes: true }` returns `Dirent<Buffer>` by default, but strict types expected `Dirent<string>` operations
- **Fix:** Added `encoding: 'utf-8'` to readdir call and typed as `Dirent<string>`, imported `Dirent` from `node:fs`
- **Files modified:** packages/project-detector/src/detectors/language.ts
- **Commit:** debb38d

## Known Stubs

None — detectProject returns real data from filesystem scanning.

## Self-Check: PASSED

- ✅ `packages/project-detector/src/detector.ts` exists
- ✅ `packages/project-detector/src/detector.test.ts` exists (7 tests)
- ✅ `packages/project-detector/dist/index.js` exists
- ✅ `packages/project-detector/dist/index.d.ts` exists
- ✅ 7/7 tests pass via `pnpm --filter @ia-framework/project-detector test`
- ✅ Commit `debb38d` exists
