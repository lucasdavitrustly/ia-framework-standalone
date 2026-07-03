# Implementation Plan: OpenCode JSONC Config & Trustly LLM Models

**Branch**: `015-opencode-jsonc-trustly-models` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-opencode-jsonc-trustly-models/spec.md`

## Summary

Add `opencode.jsonc` support to the ia-framework installer, configure Trustly LLM gateway models (Amazon Bedrock Claude variants) as a new Step 5.3, implement dual-write to both `opencode.json` and `opencode.jsonc`, and document the configuration in the README. The installer prompts for a Trustly API token (empty is valid) and performs full content migration from any existing `opencode.json`.

## Technical Context

**Language/Version**: Bash (POSIX-compatible with bashisms for installer scripts), Node.js >= 22 (for inline JSON manipulation via `node --input-type=module`)

**Primary Dependencies**: Existing installer infrastructure (`scripts/installer-helpers.sh`, `scripts/configure-mcp.sh`, `scripts/install-opencode.sh`), `scripts/ide-descriptors/opencode.sh`

**Storage**: Filesystem only — `~/.config/opencode/opencode.jsonc` and `~/.config/opencode/opencode.json`

**Testing**: Manual integration testing (installer scripts); potential bash-based smoke tests via `bats` or shell assertions

**Target Platform**: macOS (Darwin) and Linux — same as existing installer

**Project Type**: CLI installer / shell scripts + documentation

**Performance Goals**: Under 30 seconds additional install time (per SC-001)

**Constraints**: Must be idempotent, non-interactive safe (CI), backward compatible with older OpenCode versions

**Scale/Scope**: Single-user local config files; no network calls beyond what OpenCode already does

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. TDD | N/A | Installer bash scripts are outside TypeScript source — no Vitest scope. Integration testing via manual run or CI smoke test. |
| II. TypeScript-Only | PASS | No new TypeScript source files. Inline `node --input-type=module` scripts follow existing pattern in `configure-mcp.sh`. |
| III. Local-First | PASS | No external service dependency introduced. Gateway URL is config-only (used by OpenCode at runtime, not by the installer). |
| IV. Monorepo Architecture | PASS | No new packages. Changes confined to `scripts/`, `install.sh`, `README.md`. |
| V. Simplicity | PASS | Reuses existing patterns: `install_mcp_opencode()` dual-write, `prompt_yn()`, inline Node.js JSON manipulation. |
| VI. Incremental by Default | PASS | Idempotent: existing provider kept by default; merge-not-overwrite semantics. |
| VII. MCP-First Interface | N/A | This feature is installer/config tooling, not MCP tool surface. |

**Gate result: PASS** — No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/015-opencode-jsonc-trustly-models/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/           # Phase 1 output (N/A — no external API contracts)
```

### Source Code (repository root)

```text
scripts/
├── install-opencode.sh           # MODIFY: add configure_opencode_jsonc() function
├── configure-mcp.sh              # MODIFY: dual-write to both .json and .jsonc
├── ide-descriptors/
│   └── opencode.sh               # MODIFY: update IDE_MCP_CONFIG to .jsonc
└── installer-helpers.sh          # NO CHANGE (reuse existing helpers)

install.sh                         # MODIFY: add Step 5.3 call
README.md                          # MODIFY: add Trustly Bedrock models section
```

**Structure Decision**: No new directories or packages. All changes are modifications to existing shell scripts and the README. The `configure_opencode_jsonc()` function lives in `scripts/install-opencode.sh` alongside the existing `install_opencode()` function.
