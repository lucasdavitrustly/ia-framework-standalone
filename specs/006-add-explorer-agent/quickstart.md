# Quickstart: Add Explorer Agent to Global Configuration

## What Changed

After running `install.sh`, the OpenCode global configuration now includes a custom `explore` agent that overrides the built-in explorer. This agent is optimized for ia-framework codebase exploration using semantic search via MCP tools.

## Verification

After install, verify the agent file exists:

```bash
cat ~/.config/opencode/agents/explore.md
```

Then restart OpenCode and verify the agent is available:

- The Task tool should list `explore` as an available subagent type
- Invoking `@explore` should use the custom prompt with ia-framework MCP tools

## How It Works

1. `install.sh` calls `configure_opencode()` from `scripts/configure-opencode.sh`
2. The function creates `~/.config/opencode/agents/explore.md` with the agent definition
3. OpenCode loads markdown agents from `~/.config/opencode/agents/` on startup
4. The custom `explore` agent overrides the built-in explore subagent

## File Location

- Agent definition: `~/.config/opencode/agents/explore.md`
- Script that creates it: `scripts/configure-opencode.sh`
