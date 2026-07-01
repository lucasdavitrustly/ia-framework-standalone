# Phase 1 Data Model: PostgreSQL db.json Bootstrap

**Feature**: `013-postgres-db-bootstrap` | **Date**: 2026-07-01

This feature introduces no new persistent schema. It reuses the existing
`DatabaseConfig` shape and describes two MCP descriptor entities.

## Entity: DatabaseConfig (`.ia-framework/db.json`)

Authoritative source: `packages/db-context/src/types.ts` (`DatabaseConfigSchema`, Zod). Unchanged by this feature.

| Field      | Type    | Required | Default              | Validation                |
| ---------- | ------- | -------- | -------------------- | ------------------------- |
| `host`     | string  | yes      | —                    | non-empty                 |
| `port`     | integer | no       | `5432`               | 1–65535                   |
| `database` | string  | yes      | —                    | non-empty                 |
| `user`     | string  | yes      | —                    | non-empty                 |
| `password` | string  | yes      | —                    | any string (may be empty) |
| `ssl`      | boolean | no       | `false` (documented) | optional                  |

**Location**: `<framework-dir>/.ia-framework/db.json`, where `<framework-dir>` = `dirname(project.json)`.

**Lifecycle / state transitions**:

- `absent` → `written`: installer creates `.ia-framework/` (if missing) and writes `db.json` after prompting.
- `written` → `kept`: on re-run, existing valid file retained (user declines overwrite; default).
- `written` → `overwritten`: on re-run, user confirms overwrite; file replaced.

**Consumers**: `@ia-framework/db-context` `loadDbConfig` → ia-framework MCP `query_database` / `index_database_schema` tools; `ia-framework db connect|status|index` CLI subcommands.

**Derived value — PostgreSQL DSN**: built (not stored) from these fields as
`postgresql://<user>:<encode(password)>@<host>:<port>/<database>` with optional
`?sslmode=require` when `ssl` is true. Password percent-encoded (FR-011).

## Entity: PostgreSQL MCP Descriptor (`mcps/postgres-mcp/mcp.json`)

| Field            | Value                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------- |
| `id`             | `postgres`                                                                              |
| `name`           | `PostgreSQL`                                                                            |
| `default`        | `false`                                                                                 |
| `requires_build` | `false`                                                                                 |
| `command`        | `["npx","-y","@modelcontextprotocol/server-postgres","{{POSTGRES_CONNECTION_STRING}}"]` |
| `environment`    | `{}` (env-var form removed)                                                             |
| `per_ide`        | `{ opencode: {type:"local"}, claude-code: {type:"local"} }`                             |

**Placeholder**: `{{POSTGRES_CONNECTION_STRING}}` resolved at install time from `db.json` values. Committed file contains only the placeholder token — no credentials (FR-010).

## Entity: Atlassian MCP Descriptor (`mcps/atlassian-mcp/mcp.json`) — NEW

| Field            | Value                                                                        |
| ---------------- | ---------------------------------------------------------------------------- |
| `id`             | `atlassian`                                                                  |
| `name`           | `Atlassian`                                                                  |
| `default`        | `false`                                                                      |
| `requires_build` | `false`                                                                      |
| `command`        | `["npx","-y","mcp-remote@latest","https://mcp.atlassian.com/v1/mcp/authv2"]` |
| `environment`    | `{}`                                                                         |
| `per_ide`        | `{ opencode: {type:"local"}, claude-code: {type:"local"} }`                  |

**Note**: The endpoint URL is a public, non-secret Atlassian MCP address; auth is handled interactively by `mcp-remote` (OAuth), so no credentials are committed. Replaces `mcps/jira-mcp/` (deleted).
