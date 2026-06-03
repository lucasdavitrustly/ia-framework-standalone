# Quickstart: Fix MCP Stderr Configuration

## What Changed

The `scripts/configure-opencode.sh` script was generating an invalid `"stderr"` field in OpenCode's MCP config. OpenCode doesn't support this field, causing startup failures.

## Fix Applied

The MCP server command now uses a shell wrapper to redirect stderr to the log file:

```json
"command": ["sh", "-c", "node /path/to/bin.js 2>> /path/to/.ia-framework/logs/mcp-server.log"]
```

Instead of the broken:

```json
"command": ["node", "/path/to/bin.js"],
"stderr": "2>> /path/to/.ia-framework/logs/mcp-server.log"
```

## Verification

1. Run the install script: `bash install.sh`
2. Start OpenCode: `opencode`
3. Verify the ia-framework MCP server connects (tools appear in tool list)
4. Trigger any ia-framework tool call
5. Check logs: `cat .ia-framework/logs/mcp-server.log` — should contain JSON log entries

## Migration

Re-running `install.sh` (or `source scripts/configure-opencode.sh && configure_opencode`) will automatically:

- Remove the invalid `stderr` field from existing config
- Rewrite the `command` array to use the shell wrapper format
- Preserve all other settings (`environment`, `enabled`, etc.)

## OpenCode Installation

The install script now offers multiple official installation methods:

- **macOS (default)**: `brew install anomalyco/tap/opencode`
- **Linux/Other (default)**: `curl -fsSL https://opencode.ai/install | bash`
- **Alternatives**: `npm i -g opencode-ai`, `bun add -g opencode-ai`, `paru -S opencode`

Only methods with detected package managers are shown. Use `IA_NON_INTERACTIVE=1` to auto-select the platform default without prompting.
