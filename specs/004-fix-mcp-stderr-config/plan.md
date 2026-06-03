# Implementation Plan: Fix MCP Stderr Configuration

**Branch**: `004-fix-mcp-stderr-config` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-fix-mcp-stderr-config/spec.md`

## Summary

The `scripts/configure-opencode.sh` script currently writes an invalid `"stderr"` field to OpenCode's MCP config (`opencode.json`), causing OpenCode to fail on startup. The fix replaces the invalid field with a shell wrapper command (`sh -c "node bin.js 2>> logfile"`) that performs stderr redirection natively, and removes the `stderr` field from existing broken configs during migration.

## Technical Context

**Language/Version**: Bash (configure-opencode.sh) + Node.js inline script for JSON manipulation

**Primary Dependencies**: OpenCode MCP config schema (supports: `type`, `command`, `environment`, `enabled`, `timeout` only)

**Storage**: N/A (config file manipulation only)

**Testing**: Manual verification — start OpenCode after install, confirm MCP connects and logs appear

**Target Platform**: macOS/Linux (developer workstations)

**Project Type**: CLI/installer script (shell)

**Performance Goals**: N/A (one-time config generation)

**Constraints**: Must be idempotent; must migrate existing broken configs; must not break other MCP servers in the same config

**Scale/Scope**: Single script file change (`scripts/configure-opencode.sh`)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Status | Notes                                                                               |
| -------------------------- | ------ | ----------------------------------------------------------------------------------- |
| I. TDD                     | N/A    | This is a shell script fix, not TypeScript source code. No Vitest tests applicable. |
| II. TypeScript-Only        | N/A    | The change is in a Bash script (installer infrastructure), not source code.         |
| III. Local-First           | PASS   | No external dependencies introduced.                                                |
| IV. Monorepo Architecture  | PASS   | Single script in `scripts/` — no new packages.                                      |
| V. Simplicity              | PASS   | Minimal change: fix command array, remove invalid field.                            |
| VI. Incremental by Default | N/A    | Not an indexing operation.                                                          |
| VII. MCP-First Interface   | PASS   | Fixes MCP server connectivity; preserves stdio transport.                           |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/004-fix-mcp-stderr-config/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal — config shape only)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
scripts/
└── configure-opencode.sh    # MODIFY: fix command array, remove stderr field, add migration
```

**Structure Decision**: Single file modification in existing `scripts/` directory. No new directories or packages needed.
