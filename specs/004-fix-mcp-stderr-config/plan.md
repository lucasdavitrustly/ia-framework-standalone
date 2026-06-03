# Implementation Plan: Fix MCP Stderr Configuration

**Branch**: `004-fix-mcp-stderr-config` | **Date**: 2026-06-03 | **Spec**: `specs/004-fix-mcp-stderr-config/spec.md`

**Input**: Feature specification from `/specs/004-fix-mcp-stderr-config/spec.md`

## Summary

Fix the broken `stderr` field in OpenCode's MCP configuration that prevents startup, replace it with a shell wrapper command for stderr redirection, and update the OpenCode installation to offer official install methods with platform-aware defaults.

## Technical Context

**Language/Version**: Bash 5+ (shell scripts for installer tooling)

**Primary Dependencies**: OpenCode CLI, jq/node (JSON manipulation), curl/brew/npm/bun/paru (install methods)

**Storage**: JSON config files (`~/.config/opencode/opencode.json`, `.ia-framework/project.json`)

**Testing**: Manual verification (shell scripts); validate OpenCode starts and MCP connects

**Target Platform**: macOS (primary), Linux (secondary)

**Project Type**: CLI installer / shell tooling

**Performance Goals**: N/A (one-shot installer)

**Constraints**: Must work without Node.js initially (for fresh installs where Node isn't yet available); curl always available as fallback

**Scale/Scope**: Single developer local setup

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Status | Notes                                                                                   |
| -------------------------- | ------ | --------------------------------------------------------------------------------------- |
| I. TDD                     | N/A    | Shell installer scripts — no vitest applicable. Tested via manual acceptance scenarios. |
| II. TypeScript-Only        | N/A    | This feature modifies bash scripts only (infrastructure tooling, not source code).      |
| III. Local-First           | PASS   | All operations are local.                                                               |
| IV. Monorepo Architecture  | PASS   | Scripts are in `scripts/` at repo root, not a new package.                              |
| V. Simplicity              | PASS   | Straightforward shell logic; no heavy abstractions.                                     |
| VI. Incremental by Default | N/A    | Not an indexing operation.                                                              |
| VII. MCP-First Interface   | PASS   | Fix ensures MCP server connects correctly.                                              |

No violations. Proceed.

## Project Structure

### Documentation (this feature)

```text
specs/004-fix-mcp-stderr-config/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
scripts/
├── install-opencode.sh  # MODIFIED: Multi-method install with platform detection
├── configure-opencode.sh # MODIFIED: Fix stderr field → shell wrapper command
└── check-prerequisites.sh # EXISTING: check_opencode() already exists

install.sh               # EXISTING: Orchestrator (no changes expected)
```

**Structure Decision**: All changes are to existing scripts in `scripts/`. No new files or directories needed.
