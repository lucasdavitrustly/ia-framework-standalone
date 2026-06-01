# Implementation Plan: Replace GSD with GitHub SpecKit

**Branch**: `001-replace-gsd-speckit` | **Date**: 2026-06-01 | **Spec**: `specs/001-replace-gsd-speckit/spec.md`

**Input**: Feature specification from `/specs/001-replace-gsd-speckit/spec.md`

## Summary

Replace the deprecated GSD (GetShitDone) framework references with GitHub SpecKit as the SDD framework. Integrate SpecKit CLI (`specify`) installation into `install.sh` so that any developer who clones the repo gets the tool globally (enabling `/speckit.*` commands in OpenCode for any project). Remove `.opencode/` from git tracking to make it per-user config.

## Technical Context

**Language/Version**: Bash (shell scripts), Python 3.11+ (SpecKit runtime), Node.js >= 22.0.0 (ia-framework)

**Primary Dependencies**: uv (Astral Python package manager), specify-cli (from github/spec-kit), git

**Storage**: N/A (file system operations only)

**Testing**: Manual verification scripts; no Vitest tests needed (shell script changes only)

**Target Platform**: macOS / Linux (developer workstations)

**Project Type**: Monorepo tooling / installer scripts

**Performance Goals**: N/A (one-time installer operations)

**Constraints**: Must not hard-fail if SpecKit or its dependencies cannot be installed; must preserve local `.opencode/` files on disk

**Scale/Scope**: ~5 files modified, 1 new script module

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Status | Notes                                                                   |
| -------------------------- | ------ | ----------------------------------------------------------------------- |
| I. TDD                     | N/A    | Shell script changes; no TypeScript implementation code added.          |
| II. TypeScript-Only        | N/A    | This feature modifies only shell scripts and markdown files.            |
| III. Local-First           | PASS   | SpecKit CLI runs locally. No external service dependency at runtime.    |
| IV. Monorepo Architecture  | PASS   | No new packages introduced. Changes are to root-level scripts and docs. |
| V. Simplicity              | PASS   | Adding a simple install check + prompt. No abstractions introduced.     |
| VI. Incremental by Default | N/A    | Not an indexing/processing feature.                                     |
| VII. MCP-First Interface   | N/A    | Not an MCP tool feature.                                                |

**Gate Result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-replace-gsd-speckit/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
install.sh                       # Modified: source new speckit module
scripts/
├── install-speckit.sh           # NEW: SpecKit CLI installation module
├── check-prerequisites.sh       # Existing (unchanged)
├── install-docker.sh            # Existing (unchanged)
├── install-node.sh              # Existing (unchanged)
├── install-ollama.sh            # Existing (unchanged)
├── install-opencode.sh          # Existing (unchanged)
├── start-services.sh            # Existing (unchanged)
└── init-config.sh               # Existing (unchanged)
.gitignore                       # Modified: add .opencode/ rule
.planning/PROJECT.md             # Modified: remove GSD references
.planning/STATE.md               # Modified: remove GSD references
.planning/VALIDATION.md          # Modified: remove GSD references
CLAUDE.md                        # Modified: remove GSD references (if any)
```

**Structure Decision**: No new directory structure. Changes follow the existing modular `scripts/install-*.sh` pattern. The new `install-speckit.sh` handles Python, uv, and specify CLI detection/installation.

## Complexity Tracking

> No violations — table not needed.
