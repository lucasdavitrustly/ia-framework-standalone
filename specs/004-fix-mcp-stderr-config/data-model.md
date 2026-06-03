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

## State Transitions

1. **Fresh install** (no existing config): Script writes the correct format directly.
2. **Broken config** (has `stderr` field): Script removes `stderr`, rewrites `command` to shell wrapper.
3. **Already fixed** (command is `["sh", "-c", "..."]`): Script detects wrapper format and skips.
