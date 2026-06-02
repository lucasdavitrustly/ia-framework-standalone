# Implementation Plan: Update README

**Branch**: `002-002-update-readme` | **Date**: 2026-06-02 | **Spec**: `specs/002-update-readme/spec.md`

**Input**: Feature specification from `/specs/002-update-readme/spec.md`

## Summary

Update the README.md to reflect the current state of the project: add SpecKit CLI to prerequisites, document the SpecKit installation step, ensure all CLI commands are current, and improve the tutorial flow for new users. This is a documentation-only change — no source code modifications.

## Technical Context

**Language/Version**: Markdown (documentation only)

**Primary Dependencies**: N/A — no code dependencies

**Storage**: N/A

**Testing**: Manual verification — read-through for accuracy and completeness

**Target Platform**: GitHub repository (rendered Markdown)

**Project Type**: Documentation update

**Performance Goals**: N/A

**Constraints**: Must not break existing anchor links if possible; must be accurate against current codebase state

**Scale/Scope**: 1 file modified (README.md), ~50-100 lines added/modified

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Status | Notes                                                     |
| -------------------------- | ------ | --------------------------------------------------------- |
| I. TDD                     | N/A    | Documentation-only change; no implementation code.        |
| II. TypeScript-Only        | N/A    | No source code modified.                                  |
| III. Local-First           | N/A    | No runtime behavior change.                               |
| IV. Monorepo Architecture  | N/A    | No package changes.                                       |
| V. Simplicity              | PASS   | Improves clarity for new users without adding complexity. |
| VI. Incremental by Default | N/A    | Not an indexing/processing feature.                       |
| VII. MCP-First Interface   | N/A    | Not an MCP tool feature.                                  |

**Gate Result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/002-update-readme/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
README.md                # Modified: add SpecKit, update prerequisites, improve tutorial
```

**Structure Decision**: Single file modification. No structural changes to the repository.

## Complexity Tracking

> No violations — table not needed.
