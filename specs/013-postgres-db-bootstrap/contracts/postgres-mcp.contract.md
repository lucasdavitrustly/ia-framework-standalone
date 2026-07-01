# Contract: PostgreSQL MCP Descriptor + Connection-String Substitution

**File**: `mcps/postgres-mcp/mcp.json`
**Consumers**: `scripts/configure-mcp.sh` (`scan_mcps`, `_resolve_mcp_command`, `install_mcp_*`)

## Descriptor (committed form — placeholders only)

```json
{
  "id": "postgres",
  "name": "PostgreSQL",
  "description": "PostgreSQL database access — run read-only queries against a target project's database for schema inspection and data exploration.",
  "default": false,
  "requires_build": false,
  "command": [
    "npx",
    "-y",
    "@modelcontextprotocol/server-postgres",
    "{{POSTGRES_CONNECTION_STRING}}"
  ],
  "environment": {},
  "per_ide": {
    "opencode": { "type": "local" },
    "claude-code": { "type": "local" }
  }
}
```

## Substitution contract (`_resolve_mcp_command`)

**Inputs**: `mcp.json` path, `IA_FRAMEWORK_DIR`, `CONFIG_PATH`, and (new) a `POSTGRES_CONNECTION_STRING` value supplied by the caller when the mcp id is `postgres`.

**Behavior**:

- MUST replace `{{POSTGRES_CONNECTION_STRING}}` in the command array with the resolved DSN.
- MUST continue to replace `{{MCP_BIN}}`, `{{LOG_FILE}}`, `{{CONFIG_PATH}}` for other descriptors unchanged.
- When the value is not provided (non-postgres MCP), the token substitution is a no-op.

**DSN construction** (from `db.json` values):

- Format: `postgresql://<user>:<encodeURIComponent(password)>@<host>:<port>/<database>`
- Append `?sslmode=require` when `ssl === true`.
- Password MUST be percent-encoded (FR-011).

## Post-conditions (IDE config)

For OpenCode (`opencode-json`), the written entry MUST be equivalent to:

```json
{
  "postgres": {
    "type": "local",
    "command": [
      "npx",
      "-y",
      "@modelcontextprotocol/server-postgres",
      "postgresql://USER:PASSWORD@HOST:5432/DB"
    ],
    "enabled": true
  }
}
```

with `USER/PASSWORD/HOST/DB` replaced by the user's install-time values. No credentials appear in any committed file (FR-010).

## Acceptance checks

- CK-P1: Committed `mcps/postgres-mcp/mcp.json` contains `{{POSTGRES_CONNECTION_STRING}}` and no real credentials.
- CK-P2: After install with postgres selected, the IDE config command array's last element is a valid `postgresql://` DSN built from `db.json`.
- CK-P3: A password containing `@`, `:`, `/`, `#` produces a DSN that round-trips (decodes back to the original password).
