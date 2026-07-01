# Contract: Atlassian MCP Descriptor

**File**: `mcps/atlassian-mcp/mcp.json` (NEW) — replaces `mcps/jira-mcp/` (DELETED)
**Consumers**: `scripts/configure-mcp.sh` (`scan_mcps`, `_resolve_mcp_command`, `install_mcp_*`)

## Descriptor (committed form)

```json
{
  "id": "atlassian",
  "name": "Atlassian",
  "description": "Atlassian (Jira + Confluence) remote MCP — read/write issues, search, transition statuses, and read Confluence pages via the hosted Atlassian MCP endpoint.",
  "default": false,
  "requires_build": false,
  "command": ["npx", "-y", "mcp-remote@latest", "https://mcp.atlassian.com/v1/mcp/authv2"],
  "environment": {},
  "per_ide": {
    "opencode": { "type": "local" },
    "claude-code": { "type": "local" }
  }
}
```

## Behavior

- No placeholder substitution required (no credentials in the command).
- The endpoint URL is public and non-secret; `mcp-remote` performs interactive OAuth at first use.
- `scan_mcps` MUST pick up the new descriptor automatically (it globs `mcps/*/mcp.json`).

## Post-conditions (IDE config, OpenCode)

```json
{
  "atlassian": {
    "type": "local",
    "command": ["npx", "-y", "mcp-remote@latest", "https://mcp.atlassian.com/v1/mcp/authv2"],
    "enabled": true
  }
}
```

## Acceptance checks

- CK-A1: `mcps/jira-mcp/` no longer exists.
- CK-A2: `mcps/atlassian-mcp/mcp.json` exists with id `atlassian` and the remote MCP command.
- CK-A3: Running the installer offers "Atlassian" (not "Jira") in the MCP selection list.
- CK-A4: No credentials committed (FR-010).
