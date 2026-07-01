# Implementation Plan: PostgreSQL db.json Bootstrap + MCP Descriptor Alignment + README Refresh

**Branch**: `013-postgres-db-bootstrap` | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-postgres-db-bootstrap/spec.md`

## Summary

Wire PostgreSQL connection setup into `install.sh` so that, when the user selects the PostgreSQL MCP during harness configuration (Step 5.1), the installer prompts for connection details, creates the `.ia-framework` folder if missing, and writes a valid `db.json`. Align the two stale MCP descriptors with the user's working setup — PostgreSQL via `@modelcontextprotocol/server-postgres` with a connection-string argument, and a new Atlassian MCP (`mcp-remote` → `https://mcp.atlassian.com/v1/mcp/authv2`) replacing the unused Jira descriptor — keeping only placeholder connection strings in version control. Finally, refresh `README.md` to reflect current install flow, MCPs, configuration, and commands.

## Technical Context

**Language/Version**: Bash (installer + scripts), TypeScript 5 / Node.js >= 22 (CLI reuse), JSON descriptors, Markdown (README)

**Primary Dependencies**: existing installer scripts (`scripts/configure-mcp.sh`, `scripts/init-config.sh`, `scripts/installer-helpers.sh`), `@ia-framework/db-context` (`DatabaseConfigSchema`, `loadDbConfig`), `packages/cli` `db configure` command, MCP descriptors under `mcps/*/mcp.json`

**Storage**: `.ia-framework/db.json` (PostgreSQL connection config: `{host, port, database, user, password, ssl}`)

**Testing**: Vitest (constitution mandates TDD); bash unit coverage via existing test conventions for scripts where present; schema round-trip via `db-context` tests

**Target Platform**: macOS/Linux developer machines running `install.sh`

**Project Type**: pnpm monorepo (CLI + MCP server + installer shell scripts)

**Performance Goals**: N/A (interactive one-shot install step; no throughput target)

**Constraints**: Placeholders only in committed files (no real credentials); non-interactive/CI runs MUST NOT hang; idempotent re-runs MUST NOT silently discard a valid existing `db.json`; connection string MUST correctly encode passwords with special characters

**Scale/Scope**: Single installer step, 2 MCP descriptor files, `_resolve_mcp_command` substitution extension, 1 CLI hardening (`mkdir -p`), README section updates

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. TDD (Non-Negotiable)**: Applies to any TypeScript touched. The CLI `db configure` hardening (add `mkdir -p` before write) MUST have a failing test first (writes `db.json` when `.ia-framework` is absent). Bash installer changes verified via the existing manual/CI install path; where a script test harness exists it is extended. **PASS** (test-first for TS change).
- **II. TypeScript-Only**: Only TS change is the existing `db.command.ts`; no new `.js` source. Note a pre-existing strict-mode error at `db.command.ts:160` that this feature will encounter and MUST resolve when touching the file. **PASS**.
- **III. Local-First**: No new external service dependency. PostgreSQL is the target project's DB, configured locally into `db.json`. Atlassian MCP is an optional, non-default integration behind a placeholder. **PASS**.
- **IV. Monorepo Architecture**: Changes confined to `packages/cli`, `mcps/`, `scripts/`, root `README.md`; no new package, no circular deps. **PASS**.
- **V. Simplicity & No Heavy Abstractions**: Reuse the existing `db configure` CLI as the single source of truth for `db.json` shape rather than duplicating the writer in bash. Extend the existing placeholder-substitution mechanism (`_resolve_mcp_command`) rather than inventing a new one. **PASS**.
- **VI. Incremental by Default**: N/A to indexing; install step is idempotent (keep/overwrite guard). **PASS**.
- **VII. MCP-First Interface**: The `db.json` feeds the ia-framework `query_database`/`index_database_schema` MCP tools; the postgres/atlassian MCP descriptors are the MCP surface. **PASS**.

**Result**: No violations. Complexity Tracking table not required.

## Project Structure

### Documentation (this feature)

```text
specs/013-postgres-db-bootstrap/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── db-json.schema.json          # db.json shape contract
│   ├── postgres-mcp.contract.md     # postgres descriptor + substitution contract
│   └── atlassian-mcp.contract.md    # atlassian descriptor contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (already created)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created here)
```

### Source Code (repository root)

```text
install.sh                              # Orchestrator; Step 5.1 wires postgres db.json bootstrap
scripts/
├── configure-mcp.sh                    # Adds postgres selection → db.json prompt + conn-string substitution
├── init-config.sh                      # Reference pattern for raw read -rp prompting + mkdir -p
└── installer-helpers.sh                # is_noninteractive(), prompt_yn(); reused, no new helper required
mcps/
├── postgres-mcp/mcp.json               # Rewritten: @modelcontextprotocol/server-postgres + placeholder conn string
├── atlassian-mcp/mcp.json              # NEW: mcp-remote → https://mcp.atlassian.com/v1/mcp/authv2 (placeholder-friendly)
└── jira-mcp/                           # REMOVED (replaced by atlassian-mcp)
packages/
├── cli/src/commands/db.command.ts      # Harden: mkdir -p .ia-framework before writing db.json; fix pre-existing L160 strict error
├── cli/src/commands/db.command.test.ts # Failing-first test: writes db.json when folder absent
└── db-context/src/types.ts             # DatabaseConfigSchema (unchanged; source of truth for shape)
README.md                               # Refresh: install flow, MCP list, configuration, commands
```

**Structure Decision**: No new packages. The feature is a thin integration across the installer shell layer (`install.sh` + `scripts/configure-mcp.sh`), two JSON descriptors under `mcps/`, one hardening edit in `packages/cli`, and documentation. `db.json` shape stays owned by `@ia-framework/db-context` (`DatabaseConfigSchema`) and is written via the existing `ia-framework db configure` CLI to avoid duplicating the writer in bash.

## Complexity Tracking

> No Constitution Check violations — table intentionally omitted.
