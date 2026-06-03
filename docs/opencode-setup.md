# OpenCode MCP Integration Setup

This guide explains how to configure OpenCode to use ia-framework's MCP server for AI-powered codebase search.

## Automatic Setup

The installer (`./install.sh`) automatically configures OpenCode MCP integration. After running the installer, restart OpenCode to load the ia-framework tools.

The installer also configures a custom **explore** agent (`~/.config/opencode/agents/explore.md`) that overrides OpenCode's built-in explorer. This agent is optimized for ia-framework codebase exploration using semantic search via MCP tools.

## Manual Setup

If you need to configure OpenCode manually (or the automatic setup failed):

### 1. Find your OpenCode config file

OpenCode's config lives at:

- **macOS/Linux**: `~/.config/opencode/opencode.json`
- **Custom XDG**: `$XDG_CONFIG_HOME/opencode/opencode.json`

Create the file if it doesn't exist.

### 2. Add the ia-framework MCP server

Add the following to your `opencode.json`:

```json
{
  "mcpServers": {
    "ia-framework": {
      "command": "node",
      "args": ["/absolute/path/to/ia-framework/packages/mcp-server/dist/bin.js"],
      "env": {
        "IA_FRAMEWORK_CONFIG": "/absolute/path/to/ia-framework/.ia-framework/project.json"
      }
    }
  }
}
```

Replace both paths with the actual absolute paths on your machine.

**Example** (if ia-framework is cloned to `~/projects/ia-framework`):

```json
{
  "mcpServers": {
    "ia-framework": {
      "command": "node",
      "args": ["/Users/alice/projects/ia-framework/packages/mcp-server/dist/bin.js"],
      "env": {
        "IA_FRAMEWORK_CONFIG": "/Users/alice/projects/ia-framework/.ia-framework/project.json"
      }
    }
  }
}
```

### 3. Verify the MCP binary exists

```bash
ls packages/mcp-server/dist/bin.js
```

If missing, build the framework first:

```bash
pnpm build
```

### 4. Restart OpenCode

Close and reopen OpenCode. The ia-framework MCP tools should now appear.

## Available MCP Tools

Once configured, OpenCode will have access to these tools:

| Tool               | Description                                     |
| ------------------ | ----------------------------------------------- |
| `search_codebase`  | Semantic search across indexed code chunks      |
| `get_file`         | Retrieve all indexed chunks for a specific file |
| `get_dependencies` | Get chunks related to a file's imports          |

## Using IA_FRAMEWORK_CONFIG

You can point the MCP server at any config file using the environment variable:

```json
{
  "env": {
    "IA_FRAMEWORK_CONFIG": "/path/to/your/.ia-framework/project.json"
  }
}
```

This allows running multiple ia-framework configurations (e.g., for different projects).

## Troubleshooting

**MCP tools not appearing in OpenCode:**

1. Verify the `bin.js` path is correct and the file exists
2. Check that `pnpm build` has been run
3. Restart OpenCode completely
4. Check OpenCode logs for MCP connection errors

**Search returns no results:**

1. Ensure codebase is indexed: `node packages/cli/dist/bin.js index`
2. Check Qdrant is running: `node packages/cli/dist/bin.js status`
3. Verify the config file path in `IA_FRAMEWORK_CONFIG`

**Qdrant not reachable:**

```bash
docker compose up -d qdrant
```
