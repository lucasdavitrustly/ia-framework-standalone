# Phase 0 Research: PostgreSQL db.json Bootstrap + MCP Descriptor Alignment

**Feature**: `013-postgres-db-bootstrap` | **Date**: 2026-07-01

All Technical Context items were resolvable from the existing codebase and the four clarifications resolved during `/speckit.specify`. No open `NEEDS CLARIFICATION` remain.

## R1 — Where and how `db.json` is written today

**Decision**: Reuse the existing `ia-framework db configure` CLI command as the single writer of `db.json`, hardened to `mkdir -p` the `.ia-framework` folder before writing.

**Findings**:

- `packages/cli/src/commands/db.command.ts:31` (`configure` subcommand) already prompts host/port/database/user/password/ssl, validates with `DatabaseConfigSchema`, and writes `.ia-framework/db.json`.
- It resolves the db.json path via `resolveDbConfigPath()` = `dirname(configPath)/db.json` (`db.command.ts:17`), where `configPath` comes from `--config`, `IA_FRAMEWORK_CONFIG`, or `cwd/.ia-framework/project.json`.
- **Gap**: it calls `writeFile(dbConfigPath, ...)` (`db.command.ts:62`) without ensuring the parent directory exists. On a fresh checkout with no `.ia-framework/`, this throws `ENOENT`.
- `packages/db-context/src/types.ts:3` defines the authoritative shape: `{ host, port(default 5432), database, user, password, ssl? }`.
- `packages/db-context/src/loader.ts:12` loads/validates it and supports a `DB_HOST` env override (used by the Docker dashboard).

**Rationale**: Constitution Principle V (Simplicity) — do not duplicate the JSON writer/validator in bash. A single TS writer keeps the schema authoritative and testable (Principle I). The installer shells out to the built CLI (`packages/cli/dist/bin.js`), mirroring how `init-config.sh:189` and `install.sh:263` already invoke the CLI.

**Alternatives considered**:

- _Inline bash `cat > db.json`_ (as `init-config.sh` does for `project.json`): rejected — duplicates schema knowledge in shell, easy to drift from Zod schema, harder to validate.
- _New `scripts/configure-postgres.sh` with its own Node heredoc_: rejected — adds a parallel code path for the same file.

**Pre-existing defect to fix when touching the file**: `db.command.ts:160` has a strict-mode error (`config.targetProjectPath` is `string | undefined` passed where `string` expected in the `index` subcommand). Since the feature edits this file, the plan resolves it (guard/assert) so `pnpm build` stays green (Quality Gate).

## R2 — How placeholders are substituted into IDE MCP config

**Decision**: Extend `_resolve_mcp_command` (`scripts/configure-mcp.sh:152`) to substitute a new `{{POSTGRES_CONNECTION_STRING}}` token in the postgres descriptor's command array, sourced from the values collected for `db.json`.

**Findings**:

- `_resolve_mcp_command` currently substitutes only `{{MCP_BIN}}`, `{{LOG_FILE}}`, `{{CONFIG_PATH}}` in `command_template`/`command`.
- Per-IDE installers (`install_mcp_opencode`, `install_mcp_claude`, `install_mcp_vscode`, `install_mcp_codex`) consume the resolved array; opencode/claude also resolve `environment` placeholders.
- The user's working postgres entry passes the connection string as the **last command arg**: `["npx","-y","@modelcontextprotocol/server-postgres","postgresql://USER:PASSWORD@HOST:5432/DB"]`.

**Rationale**: Reusing the existing substitution seam keeps one mechanism (Principle V). The connection string is built once from db.json values and injected into the command, matching the working setup exactly (FR-007, FR-008).

**Alternatives considered**:

- _Keep `POSTGRES_CONNECTION_STRING` env var_: rejected — does not match the working setup (arg form) and the user chose "match your working config".
- _Read db.json at MCP-start time_: rejected — `@modelcontextprotocol/server-postgres` takes the DSN as an argument, not from db.json.

## R3 — Connection-string construction (password escaping)

**Decision**: Build `postgresql://<user>:<enc(password)>@<host>:<port>/<database>[?sslmode=require]` with the password percent-encoded.

**Findings**: Passwords may contain `@ : / ? # %` which break a naive DSN. Node's `encodeURIComponent` (or `URL`/`URLSearchParams`) correctly encodes them. Since the connection string is assembled from db.json values, the safest place to build it is a tiny Node one-liner in `configure-mcp.sh` (consistent with the file's existing Node heredocs), reusing already-collected values.

**Rationale**: FR-011 requires correct handling of special characters. Node encoding avoids brittle bash escaping.

**Alternatives considered**: pure-bash escaping — rejected as error-prone.

## R4 — Trigger point and idempotency

**Decision**: Trigger the db.json prompt inside Step 5.1 when `postgres` is among `SELECTED_MCPS`, before/at the point the postgres MCP is installed for each IDE. Prompt keep/overwrite when `db.json` already exists (default keep), reusing `prompt_yn` (`installer-helpers.sh:39`).

**Findings**:

- `configure_mcps` (`configure-mcp.sh:463`) already knows `SELECTED_MCPS` and iterates IDE×MCP.
- `is_noninteractive` (`installer-helpers.sh:30`) returns true under CI/no-TTY; `prompt_yn` honors defaults non-interactively — so CI never hangs (FR-012).
- No generic text-input helper exists; `init-config.sh:153` uses raw `read -r` with a validation loop — the postgres prompt follows that established pattern (or delegates entirely to `db configure`, which already prompts).

**Rationale**: Matches the confirmed decision "when postgres MCP is selected" (FR-001, FR-006) and keeps prompting where MCP selection state lives. Idempotency guard satisfies FR-004 / SC-005.

**Alternatives considered**:

- _Always-on dedicated step_: rejected per clarification.
- _Delegate all prompting to `db configure`_: viable and preferred for the values themselves; the installer still owns the keep/overwrite decision and the connection-string substitution. **Chosen hybrid**: installer checks existence + confirms overwrite, then invokes `db configure` (which prompts + writes), then builds the DSN for substitution.

## R5 — Atlassian MCP replacing Jira

**Decision**: Add `mcps/atlassian-mcp/mcp.json` (id `atlassian`) with command `["npx","-y","mcp-remote@latest","https://mcp.atlassian.com/v1/mcp/authv2"]`; remove `mcps/jira-mcp/`.

**Findings**: The user's live config uses exactly this remote-MCP launcher, no env vars, `type: local`. The old `jira-mcp` used a non-existent `@anthropic-ai/mcp-server-jira` package. Descriptor fields observed across `mcps/*/mcp.json`: `id, name, description, default, requires_build, command|command_template, environment, per_ide`.

**Rationale**: FR-009 — offer the integration actually in use. The endpoint URL is a stable public Atlassian MCP URL (not a secret), so it is committed as-is; no real credentials are involved (auth happens via `mcp-remote` interactive OAuth), satisfying FR-010.

**Alternatives considered**:

- _Keep jira + add atlassian_: rejected per clarification (replace).
- _Treat the URL as a placeholder token_: unnecessary — the URL is public and non-secret; committing it verbatim is correct while still containing no credentials.

## R6 — README scope

**Decision**: Update existing README sections in place (no restructure): Quick Start / install flow, "Extending with MCP Servers" (postgres + atlassian with placeholder DSN examples, remove jira), Database Context, Configuration, CLI/MCP command references.

**Findings**: README is ~1100+ lines with established headings (Quick Start, CLI Reference, MCP Tools, Extending with MCP Servers, Configuration, Database Context). Editing in place preserves the doc's structure and satisfies FR-013/014/015 and SC-004.

**Rationale**: Minimize churn; document only current behavior (Assumptions: no new product behavior beyond Stories 1–2).

## Summary of Decisions

| #   | Decision                                                                                            |
| --- | --------------------------------------------------------------------------------------------------- |
| R1  | Reuse `db configure` CLI as sole `db.json` writer; add `mkdir -p`; fix L160 strict error            |
| R2  | Extend `_resolve_mcp_command` with `{{POSTGRES_CONNECTION_STRING}}` substitution                    |
| R3  | Build DSN with percent-encoded password via Node                                                    |
| R4  | Trigger in Step 5.1 when `postgres` selected; keep/overwrite guard; CI-safe via `is_noninteractive` |
| R5  | New `atlassian-mcp` descriptor (remote MCP); remove `jira-mcp`                                      |
| R6  | In-place README refresh of install/MCP/config/command sections                                      |
