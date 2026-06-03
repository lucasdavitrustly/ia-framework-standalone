# Data Model: Fix MCP Stderr Configuration

## Entity: OpenCode MCP Server Config Entry

Represents a single MCP server definition within `opencode.json`.

### Fields (valid schema)

| Field       | Type                     | Required | Description                       |
| ----------- | ------------------------ | -------- | --------------------------------- |
| type        | `"local"`                | Yes      | Server type                       |
| command     | `string[]`               | Yes      | Command array to spawn the server |
| environment | `Record<string, string>` | No       | Environment variables             |
| enabled     | `boolean`                | No       | Whether server is active          |
| timeout     | `number`                 | No       | Tool fetch timeout in ms          |

### Before (broken)

```json
{
  "ia-framework": {
    "type": "local",
    "command": ["node", "/path/to/bin.js"],
    "environment": { "IA_FRAMEWORK_CONFIG": "/path/to/project.json" },
    "enabled": true,
    "stderr": "2>> /path/to/.ia-framework/logs/mcp-server.log"
  }
}
```

### After (fixed)

```json
{
  "ia-framework": {
    "type": "local",
    "command": ["sh", "-c", "node /path/to/bin.js 2>> /path/to/.ia-framework/logs/mcp-server.log"],
    "environment": { "IA_FRAMEWORK_CONFIG": "/path/to/project.json" },
    "enabled": true
  }
}
```

## Entity: OpenCode Install Method

Represents a selectable installation method for the OpenCode CLI.

| Field     | Type     | Description                                     |
| --------- | -------- | ----------------------------------------------- |
| id        | string   | Method identifier (e.g., `brew`, `curl`, `npm`) |
| command   | string   | Full install command to execute                 |
| detector  | string   | `command -v <tool>` check for availability      |
| platforms | string[] | Applicable platforms (`darwin`, `linux`)        |
| priority  | number   | Selection priority (lower = preferred)          |

### Available Methods

| id   | command                                          | detector          | platforms     | priority (macOS/Linux) |
| ---- | ------------------------------------------------ | ----------------- | ------------- | ---------------------- |
| brew | `brew install anomalyco/tap/opencode`            | `command -v brew` | darwin, linux | 1 (macOS) / 3 (linux)  |
| curl | `curl -fsSL https://opencode.ai/install \| bash` | always available  | darwin, linux | 2 / 1                  |
| npm  | `npm i -g opencode-ai`                           | `command -v npm`  | darwin, linux | 3 / 2                  |
| bun  | `bun add -g opencode-ai`                         | `command -v bun`  | darwin, linux | 4 / 4                  |
| paru | `paru -S opencode`                               | `command -v paru` | linux         | — / 1 (Arch only)      |

## State Transitions

### MCP Config States

1. **Fresh install** (no existing config): Script writes the correct format directly.
2. **Broken config** (has `stderr` field): Script removes `stderr`, rewrites `command` to shell wrapper.
3. **Already fixed** (command is `["sh", "-c", "..."]`): Script detects wrapper format and skips.

### OpenCode Installation States

1. **Already installed** (`command -v opencode` succeeds): Skip, print version.
2. **Not installed, interactive**: Detect available methods, present menu, install chosen method.
3. **Not installed, non-interactive**: Auto-select platform default, install silently.
