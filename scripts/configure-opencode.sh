#!/usr/bin/env bash
# configure-opencode.sh — Configure OpenCode MCP server integration for ia-framework
# Provides: configure_opencode() function

# ──────────────────────────────────────────────────────
# configure_opencode
# Writes ia-framework MCP server entry to OpenCode's opencode.json.
# Also adds Context7 and Sequential Thinking MCP servers if not already present.
# Merges with existing config — does not overwrite unrelated settings.
# Idempotent — safe to call if already configured (skips already-present MCPs).
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
  local opencode_config="${opencode_config_dir}/opencode.json"

  # Clean up empty/invalid config.json left by previous (buggy) runs
  local bad_config="${opencode_config_dir}/config.json"
  if [ -f "$bad_config" ] && [ ! -s "$bad_config" ]; then
    rm "$bad_config"
    echo -e "  ${YELLOW:-}→${NC:-} Removed empty config.json left by previous run"
  fi

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

config.mcp = config.mcp || {};

// ia-framework MCP server
const logFile = '${ia_framework_dir}/.ia-framework/logs/mcp-server.log';
const wrapperCmd = ['sh', '-c', 'node ' + mcp_bin + ' 2>> ' + logFile];

if (!config.mcp['ia-framework']) {
  config.mcp['ia-framework'] = {
    type: 'local',
    command: wrapperCmd,
    environment: {
      IA_FRAMEWORK_CONFIG: ia_config
    },
    enabled: true
  };
  console.log('  Added: ia-framework MCP server');
} else {
  // Migrate broken config: remove invalid stderr field, fix command
  const needsMigration = config.mcp['ia-framework'].stderr ||
    (config.mcp['ia-framework'].command && config.mcp['ia-framework'].command[0] !== 'sh');
  if (needsMigration) {
    delete config.mcp['ia-framework'].stderr;
    config.mcp['ia-framework'].command = wrapperCmd;
    console.log('  Migrated: ia-framework MCP server (fixed command to use shell wrapper for log capture)');
  } else {
    console.log('  Skipped: ia-framework MCP server (already configured)');
  }
}

// Context7 MCP server
if (!config.mcp['context7']) {
  config.mcp['context7'] = {
    type: 'local',
    command: ['npx', '-y', '@upstash/context7-mcp@latest'],
    enabled: true
  };
  console.log('  Added: Context7 MCP server');
} else {
  console.log('  Skipped: Context7 MCP server (already configured)');
}

// Sequential Thinking MCP server
if (!config.mcp['sequential-thinking']) {
  config.mcp['sequential-thinking'] = {
    type: 'local',
    command: ['npx', '-y', '@modelcontextprotocol/server-sequential-thinking'],
    enabled: true
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
  "mcp": {
    "ia-framework": {
      "type": "local",
      "command": ["sh", "-c", "node ${mcp_bin} 2>> ${ia_framework_dir}/.ia-framework/logs/mcp-server.log"],
      "environment": {
        "IA_FRAMEWORK_CONFIG": "${config_path}"
      },
      "enabled": true
    },
    "context7": {
      "type": "local",
      "command": ["npx", "-y", "@upstash/context7-mcp@latest"],
      "enabled": true
    },
    "sequential-thinking": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"],
      "enabled": true
    }
  }
}
EOF
  fi

  echo -e "  ${GREEN:-}✓${NC:-} OpenCode MCP configured: ${opencode_config}"

  # ── Explorer agent (overrides built-in explore subagent) ──
  local agents_dir="${opencode_config_dir}/agents"
  local explore_agent="${agents_dir}/explore.md"

  mkdir -p "$agents_dir"

  cat > "$explore_agent" <<'AGENT_EOF'
---
description: Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.
mode: subagent
permission:
  "*": deny
  grep: allow
  glob: allow
  list: allow
  bash: allow
  webfetch: allow
  websearch: allow
  read: allow
  ia-framework_*: allow
---
You are a file search specialist. You excel at thoroughly navigating and exploring codebases.
Your strengths:
- Semantic code search using indexed embeddings
- Hybrid keyword + semantic search for finding specific identifiers
- Rapidly finding files using glob patterns
- Searching code and text with powerful regex patterns
- Reading and analyzing file contents
Guidelines:
- **ALWAYS prefer ia-framework MCP tools over glob/grep for codebase exploration:**
  - Use `ia-framework_search_codebase` for semantic/natural language queries (e.g. "how is authentication handled", "error handling logic")
  - Use `ia-framework_search_codebase_hybrid` when you know specific class/function/variable names combined with semantic intent (e.g. "MetricsStore insert method")
  - Use `ia-framework_get_file` to retrieve full file content by relative path (faster than Read for indexed files)
  - Use `ia-framework_get_dependencies` to understand a file's imports and exports
- Fall back to Glob/Grep/Read only when:
  - ia-framework tools return no results or insufficient context
  - You need to search non-code files (configs, logs, etc.)
  - You need broad file pattern matching (e.g. "find all .test.ts files")
- Use Bash only for listing directory contents or other read-only operations
- Adapt your search approach based on the thoroughness level specified by the caller
- Return file paths as absolute paths in your final response
- For clear communication, avoid using emojis
AGENT_EOF

  if [ $? -eq 0 ]; then
    if [ -f "$explore_agent" ]; then
      echo -e "  ${GREEN:-}✓${NC:-} Explorer agent configured: ${explore_agent}"
    fi
  else
    echo -e "  ${YELLOW:-}⚠${NC:-} Could not write explorer agent file — skipping"
  fi

  echo "  Restart OpenCode to activate MCP tools."
  return 0
}
