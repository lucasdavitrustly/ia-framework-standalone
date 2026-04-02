#!/usr/bin/env bash
# configure-opencode.sh — Configure OpenCode MCP server integration for ia-framework
# Provides: configure_opencode() function

# ──────────────────────────────────────────────────────
# configure_opencode
# Writes ia-framework MCP server entry to OpenCode's config.json.
# Also adds Context7 and Sequential Thinking MCP servers if not already present.
# Merges with existing config — does not overwrite unrelated settings.
# Idempotent — safe to call if already configured.
#
# Args:
#   $1 = ia_framework_dir  — absolute path to ia-framework repo
#   $2 = config_path       — absolute path to .ia-framework/project.json
#
# Exit code: 0 on success, 1 on failure.
# ──────────────────────────────────────────────────────
configure_opencode() {
  local ia_framework_dir="${1:-${SCRIPT_DIR:-$(pwd)}}"
  local config_path="${2:-${ia_framework_dir}/.ia-framework/project.json}"

  # Resolve OpenCode config directory (respects XDG_CONFIG_HOME)
  local opencode_config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
  local opencode_config="${opencode_config_dir}/config.json"

  # Path to the MCP server binary
  local mcp_bin="${ia_framework_dir}/packages/mcp-server/dist/bin.js"

  # Verify MCP server binary exists
  if [ ! -f "$mcp_bin" ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} MCP server binary not found: ${mcp_bin}"
    echo "    Run 'pnpm build' first to compile all packages."
    return 1
  fi

  # Create OpenCode config dir if needed
  mkdir -p "$opencode_config_dir"

  echo -e "  ${YELLOW:-}→${NC:-} Configuring OpenCode MCP integration..."

  if [ -f "$opencode_config" ]; then
    # Existing config — merge using node (safe JSON manipulation)
    if command -v node &>/dev/null; then
      node --input-type=module <<EOF
import { readFileSync, writeFileSync } from 'node:fs';

const configPath = '${opencode_config}';
const mcp_bin = '${mcp_bin}';
const ia_config = '${config_path}';

let config = {};
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch {
  config = {};
}

config.mcpServers = config.mcpServers || {};

// ia-framework MCP server
if (!config.mcpServers['ia-framework']) {
  config.mcpServers['ia-framework'] = {
    command: 'node',
    args: [mcp_bin],
    env: {
      IA_FRAMEWORK_CONFIG: ia_config
    }
  };
  console.log('  Added: ia-framework MCP server');
} else {
  console.log('  Skipped: ia-framework MCP server (already configured)');
}

// Context7 MCP server
if (!config.mcpServers['context7']) {
  config.mcpServers['context7'] = {
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp@latest']
  };
  console.log('  Added: Context7 MCP server');
} else {
  console.log('  Skipped: Context7 MCP server (already configured)');
}

// Sequential Thinking MCP server
if (!config.mcpServers['sequential-thinking']) {
  config.mcpServers['sequential-thinking'] = {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking']
  };
  console.log('  Added: Sequential Thinking MCP server');
} else {
  console.log('  Skipped: Sequential Thinking MCP server (already configured)');
}

writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
EOF
    else
      echo -e "  ${RED:-}✗${NC:-} node not found — cannot merge JSON config. Configure manually: see docs/opencode-setup.md"
      return 1
    fi
  else
    # No existing config — create fresh with all three MCP servers
    cat > "$opencode_config" <<EOF
{
  "mcpServers": {
    "ia-framework": {
      "command": "node",
      "args": ["${mcp_bin}"],
      "env": {
        "IA_FRAMEWORK_CONFIG": "${config_path}"
      }
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
EOF
  fi

  echo -e "  ${GREEN:-}✓${NC:-} OpenCode MCP configured: ${opencode_config}"
  echo "  Restart OpenCode to activate MCP tools."
  return 0
}
