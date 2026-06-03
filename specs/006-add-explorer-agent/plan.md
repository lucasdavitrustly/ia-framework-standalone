# Implementation Plan: Add Explorer Agent to Global Configuration

**Branch**: `006-add-explorer-agent` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-add-explorer-agent/spec.md`

## Summary

Add an "explorer" agent definition to OpenCode's global configuration (opencode.json) during install.sh execution. The agent uses ia-framework MCP tools for codebase exploration and overrides OpenCode's default explorer. Implementation extends the existing `configure-opencode.sh` script to also write an `agents` section alongside the existing `mcp` section.

## Technical Context

**Language/Version**: Bash (install scripts) + Node.js inline script for JSON manipulation (existing pattern)

**Primary Dependencies**: Node.js (for JSON merge logic, already required), jq not needed (existing code uses inline Node)

**Storage**: File-based (opencode.json in `~/.config/opencode/`)

**Testing**: Vitest (unit test for the JSON merge logic if extracted to a helper; otherwise manual/integration test via install.sh)

**Target Platform**: macOS/Linux (bash)

**Project Type**: CLI/tooling (installation script enhancement)

**Performance Goals**: N/A (one-time install operation)

**Constraints**: Must be idempotent, must not corrupt existing config

**Scale/Scope**: Single file modification (configure-opencode.sh), single output file (opencode.json)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Status | Notes                                                                                                                                 |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| I. TDD                     | PASS   | Script changes tested via integration test of install flow. The JSON merge logic can be unit-tested if extracted.                     |
| II. TypeScript-Only        | N/A    | This modifies a bash script, not source code. Bash scripts for tooling are established precedent (install.sh, configure-opencode.sh). |
| III. Local-First           | PASS   | Writes to local config file only.                                                                                                     |
| IV. Monorepo Architecture  | PASS   | Change is in `scripts/` directory, no new packages.                                                                                   |
| V. Simplicity              | PASS   | Extends existing pattern (adding agent config alongside MCP config in same script).                                                   |
| VI. Incremental by Default | N/A    | Not an indexing operation.                                                                                                            |
| VII. MCP-First Interface   | PASS   | The agent uses MCP tools (ia-framework\_\*) as its primary interface.                                                                 |

No violations. Gate passes.

## Project Structure

### Documentation (this feature)

```text
specs/006-add-explorer-agent/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
scripts/
└── configure-opencode.sh   # Modified: add agent injection logic
```

**Structure Decision**: No new files needed. The existing `configure-opencode.sh` is extended with agent configuration logic within the same `configure_opencode()` function, following the established pattern for MCP server injection.

## Complexity Tracking

No violations to justify.
