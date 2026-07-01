#!/usr/bin/env bash
# configure-mcp.sh — Interactive, descriptor-driven MCP installation
# Provides: configure_mcps() function
#
# Replaces configure-opencode.sh with IDE-agnostic, fully interactive MCP setup.
# Reads all mcps/*/mcp.json descriptors; prompts per MCP per IDE.
# Idempotent — safe to re-run; detects existing config and prompts skip/reinstall/uninstall.
#
# Usage: source this file then call configure_mcps "$SCRIPT_DIR" "$CONFIG_FILE"

# ──────────────────────────────────────────────────────────────────────────────
# scan_mcps
# Populates AVAILABLE_MCPS (IDs) and AVAILABLE_MCP_NAMES arrays.
# ──────────────────────────────────────────────────────────────────────────────
scan_mcps() {
  local mcps_dir="${SCRIPT_DIR}/mcps"
  AVAILABLE_MCPS=()
  AVAILABLE_MCP_NAMES=()
  AVAILABLE_MCP_DEFAULTS=()

  if [ ! -d "$mcps_dir" ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} No mcps/ directory found at ${mcps_dir}"
    return 0
  fi

  for mcp_json in "${mcps_dir}"/*/mcp.json; do
    [ -f "$mcp_json" ] || continue
    local id name default
    id=$(node --input-type=module 2>/dev/null <<EOF
import { readFileSync } from 'fs';
const m = JSON.parse(readFileSync('${mcp_json}','utf8'));
process.stdout.write(m.id || '');
EOF
)
    name=$(node --input-type=module 2>/dev/null <<EOF
import { readFileSync } from 'fs';
const m = JSON.parse(readFileSync('${mcp_json}','utf8'));
process.stdout.write(m.name || m.id || '');
EOF
)
    default=$(node --input-type=module 2>/dev/null <<EOF
import { readFileSync } from 'fs';
const m = JSON.parse(readFileSync('${mcp_json}','utf8'));
process.stdout.write(m.default ? 'true' : 'false');
EOF
)
    [ -n "$id" ] || continue
    AVAILABLE_MCPS+=("$id")
    AVAILABLE_MCP_NAMES+=("$name")
    AVAILABLE_MCP_DEFAULTS+=("$default")
  done
}

# ──────────────────────────────────────────────────────────────────────────────
# prompt_mcp_select
# Prompts user to select MCPs using toggle-loop UI. Populates SELECTED_MCPS.
# Default MCPs are pre-selected. In CI mode: all defaults selected silently.
# ──────────────────────────────────────────────────────────────────────────────
prompt_mcp_select() {
  SELECTED_MCPS=()

  if [ "${#AVAILABLE_MCPS[@]}" -eq 0 ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} No MCP descriptors found."
    return 0
  fi

  if is_noninteractive; then
    for i in "${!AVAILABLE_MCPS[@]}"; do
      [[ "${AVAILABLE_MCP_DEFAULTS[$i]}" == "true" ]] && SELECTED_MCPS+=("${AVAILABLE_MCPS[$i]}")
    done
    echo -e "  ${BLUE:-}→${NC:-} Non-interactive: installing default MCPs: ${SELECTED_MCPS[*]:-none}"
    return 0
  fi

  # Build descriptions array from mcp.json files
  local mcp_descs=()
  for i in "${!AVAILABLE_MCPS[@]}"; do
    local desc
    desc=$(node --input-type=module 2>/dev/null <<EOF
import { readFileSync } from 'fs';
const p = '${SCRIPT_DIR}/mcps/${AVAILABLE_MCPS[$i]}-mcp/mcp.json';
try { const m = JSON.parse(readFileSync(p,'utf8')); process.stdout.write(m.description||''); } catch {}
EOF
)
    mcp_descs+=("${desc:-}")
  done

  # Build pre-selected indices (all defaults)
  local mcp_presel=()
  for i in "${!AVAILABLE_MCPS[@]}"; do
    [[ "${AVAILABLE_MCP_DEFAULTS[$i]}" == "true" ]] && mcp_presel+=("$i")
  done

  local _mcp_result=""
  _PTS_IDS=("${AVAILABLE_MCPS[@]}")
  _PTS_NAMES=("${AVAILABLE_MCP_NAMES[@]}")
  _PTS_DESCS=("${mcp_descs[@]}")
  _PTS_PRESEL=("${mcp_presel[@]}")
  prompt_toggle_select "Select MCPs to install" "_mcp_result"

  if [ -n "$_mcp_result" ]; then
    read -ra SELECTED_MCPS <<< "$_mcp_result"
  fi
}

# ──────────────────────────────────────────────────────────────────────────────
# detect_mcp_state MCP_ID IDE_MCP_CONFIG IDE_MCP_FORMAT
# Outputs: configured | absent
# ──────────────────────────────────────────────────────────────────────────────
detect_mcp_state() {
  local mcp_id="$1"
  local config_file="$2"
  local format="$3"

  [ -f "$config_file" ] || { echo "absent"; return; }

  case "$format" in
    opencode-json|claude-json|vscode-json)
      MCP_STATE_CHECK_ID="$mcp_id" \
      MCP_STATE_CHECK_FILE="$config_file" \
      node --input-type=module <<'EOF'
import { readFileSync } from 'fs';
const f = process.env.MCP_STATE_CHECK_FILE;
const id = process.env.MCP_STATE_CHECK_ID;
try {
  const cfg = JSON.parse(readFileSync(f, 'utf8'));
  const mcpKey = cfg.mcp ?? cfg.mcpServers ?? {};
  process.stdout.write(mcpKey[id] ? 'configured' : 'absent');
} catch { process.stdout.write('absent'); }
EOF
      ;;
    codex-toml)
      # Simple grep for the MCP id in the TOML file
      if grep -q "^\[mcp\.${mcp_id}\]" "$config_file" 2>/dev/null || \
         grep -q "\"${mcp_id}\"" "$config_file" 2>/dev/null; then
        echo "configured"
      else
        echo "absent"
      fi
      ;;
    *)
      echo "absent"
      ;;
  esac
}

# ──────────────────────────────────────────────────────────────────────────────
# _resolve_mcp_command MCP_JSON_PATH IA_FRAMEWORK_DIR CONFIG_FILE
# Outputs the resolved command array as a JSON string.
# Substitutes {{MCP_BIN}}, {{LOG_FILE}}, {{CONFIG_PATH}} placeholders.
# For the postgres MCP, also substitutes {{POSTGRES_CONNECTION_STRING}} with a
# DSN built from .ia-framework/db.json (percent-encoded password).
# ──────────────────────────────────────────────────────────────────────────────
_resolve_mcp_command() {
  local mcp_json="$1"
  local ia_dir="$2"
  local config_path="$3"

  # Build the postgres DSN on demand (empty for non-postgres MCPs or when db.json
  # is absent). Only the placeholder token is substituted, so a non-postgres
  # command is unaffected.
  local pg_dsn=""
  if grep -q '{{POSTGRES_CONNECTION_STRING}}' "$mcp_json" 2>/dev/null; then
    local _db_json
    _db_json="$(db_json_path "$ia_dir" "$config_path")"
    pg_dsn="$(build_postgres_dsn "$_db_json" 2>/dev/null || true)"
  fi

  MCP_JSON_PATH="$mcp_json" \
  IA_FRAMEWORK_DIR="$ia_dir" \
  IA_CONFIG_PATH="$config_path" \
  IA_POSTGRES_DSN="$pg_dsn" \
  node --input-type=module <<'EOF'
import { readFileSync } from 'fs';
import { join } from 'path';
const mcp = JSON.parse(readFileSync(process.env.MCP_JSON_PATH, 'utf8'));
const iaDir = process.env.IA_FRAMEWORK_DIR;
const cfgPath = process.env.IA_CONFIG_PATH;
const pgDsn = process.env.IA_POSTGRES_DSN ?? '';
const mcp_bin = join(iaDir, 'packages/mcp-server/dist/bin.js');
const log_file = join(iaDir, '.ia-framework/logs/mcp-server.log');

const template = mcp.command_template ?? mcp.command;
const resolved = template.map(s =>
  s.replace('{{MCP_BIN}}', mcp_bin)
   .replace('{{LOG_FILE}}', log_file)
   .replace('{{CONFIG_PATH}}', cfgPath)
   .replace('{{POSTGRES_CONNECTION_STRING}}', pgDsn)
);
process.stdout.write(JSON.stringify(resolved));
EOF
}

# ──────────────────────────────────────────────────────────────────────────────
# db_json_path IA_FRAMEWORK_DIR CONFIG_FILE
# Echoes the resolved path to db.json (sibling of project.json).
# ──────────────────────────────────────────────────────────────────────────────
db_json_path() {
  local ia_dir="$1"
  local config_path="$2"
  # db.json lives next to project.json (i.e. inside .ia-framework/)
  local cfg_dir
  cfg_dir="$(dirname "$config_path")"
  echo "${cfg_dir}/db.json"
}

# ──────────────────────────────────────────────────────────────────────────────
# build_postgres_dsn DB_JSON_PATH
# Reads db.json and echoes a postgresql:// DSN with the password
# percent-encoded. Appends ?sslmode=require when ssl is true.
# Returns non-zero (and echoes nothing) if db.json is missing/invalid.
# ──────────────────────────────────────────────────────────────────────────────
build_postgres_dsn() {
  local db_json="$1"
  [ -f "$db_json" ] || return 1
  DB_JSON_PATH="$db_json" node --input-type=module <<'EOF'
import { readFileSync } from 'fs';
try {
  const c = JSON.parse(readFileSync(process.env.DB_JSON_PATH, 'utf8'));
  const enc = (s) => encodeURIComponent(String(s ?? ''));
  const host = c.host ?? 'localhost';
  const port = c.port ?? 5432;
  const db = c.database ?? '';
  const user = c.user ?? '';
  const pass = c.password ?? '';
  let dsn = `postgresql://${enc(user)}:${enc(pass)}@${host}:${port}/${db}`;
  if (c.ssl === true) dsn += '?sslmode=require';
  process.stdout.write(dsn);
} catch {
  process.exit(1);
}
EOF
}

# ──────────────────────────────────────────────────────────────────────────────
# configure_postgres_db_json IA_FRAMEWORK_DIR CONFIG_FILE
# Prompts (via the ia-framework CLI) for PostgreSQL connection details and writes
# .ia-framework/db.json, creating the folder if missing. Idempotent: if db.json
# exists, asks to keep or overwrite (default keep). Non-interactive safe.
# Called from configure_mcps when the postgres MCP is selected.
# ──────────────────────────────────────────────────────────────────────────────
configure_postgres_db_json() {
  local ia_dir="$1"
  local config_path="$2"
  local db_json
  db_json="$(db_json_path "$ia_dir" "$config_path")"

  # Non-interactive / CI: never prompt or hang (FR-012).
  if is_noninteractive; then
    if [ -f "$db_json" ]; then
      echo -e "  ${BLUE:-}→${NC:-} PostgreSQL db.json present — using existing config (non-interactive)"
    else
      echo -e "  ${YELLOW:-}⚠${NC:-} Non-interactive: skipping PostgreSQL db.json setup. Run 'ia-framework db configure' later."
    fi
    return 0
  fi

  # Idempotency guard: keep existing valid db.json unless user opts to overwrite.
  if [ -f "$db_json" ]; then
    if ! prompt_yn "PostgreSQL db.json already exists — overwrite?" N; then
      echo -e "  ${BLUE:-}→${NC:-} Keeping existing db.json"
      return 0
    fi
  fi

  # Single source of truth for db.json shape/validation: the ia-framework CLI.
  local cli_bin="${ia_dir}/packages/cli/dist/bin.js"
  if [ ! -f "$cli_bin" ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} ia-framework CLI not built — cannot write db.json now."
    echo -e "    Run 'pnpm build' then 'ia-framework db configure' to set the PostgreSQL connection."
    return 0
  fi

  echo -e "  ${YELLOW:-}→${NC:-} Configure PostgreSQL connection (written to .ia-framework/db.json):"
  if node "$cli_bin" db configure --config "$config_path"; then
    echo -e "  ${GREEN:-}✓${NC:-} PostgreSQL connection saved to db.json"
  else
    echo -e "  ${YELLOW:-}⚠${NC:-} PostgreSQL configuration skipped or failed — run 'ia-framework db configure' later."
  fi
  return 0
}

# ──────────────────────────────────────────────────────────────────────────────
# install_mcp_opencode MCP_JSON_PATH IDE_MCP_CONFIG IA_FRAMEWORK_DIR CONFIG_FILE
# ──────────────────────────────────────────────────────────────────────────────
install_mcp_opencode() {
  local mcp_json="$1"
  local config_file="$2"
  local ia_dir="$3"
  local config_path="$4"

  mkdir -p "$(dirname "$config_file")"
  [ -f "$config_file" ] || echo '{}' > "$config_file"

  local resolved_cmd
  resolved_cmd=$(_resolve_mcp_command "$mcp_json" "$ia_dir" "$config_path")

  MCP_JSON_PATH="$mcp_json" \
  MCP_CONFIG_FILE="$config_file" \
  MCP_RESOLVED_CMD="$resolved_cmd" \
  IA_FRAMEWORK_DIR="$ia_dir" \
  IA_CONFIG_PATH="$config_path" \
  node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const mcp = JSON.parse(readFileSync(process.env.MCP_JSON_PATH, 'utf8'));
const f = process.env.MCP_CONFIG_FILE;
const resolvedCmd = JSON.parse(process.env.MCP_RESOLVED_CMD);

let cfg = {};
try { cfg = JSON.parse(readFileSync(f, 'utf8')); } catch {}
cfg.mcp ??= {};

const entry = { type: 'local', command: resolvedCmd, enabled: true };
if (mcp.environment && Object.keys(mcp.environment).length > 0) {
  // Resolve env vars (substitute placeholders)
  const iaDir = process.env.IA_FRAMEWORK_DIR;
  const cfgPath = process.env.IA_CONFIG_PATH;
  const env = {};
  for (const [k, v] of Object.entries(mcp.environment)) {
    env[k] = v
      .replace('{{IA_FRAMEWORK_DIR}}', iaDir)
      .replace('{{CONFIG_PATH}}', cfgPath)
      .replace('{{MCP_BIN}}', `${iaDir}/packages/mcp-server/dist/bin.js`);
  }
  if (Object.keys(env).some(k => env[k])) entry.environment = env;
}

cfg.mcp[mcp.id] = entry;
writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
EOF
}

# ──────────────────────────────────────────────────────────────────────────────
# install_mcp_claude MCP_JSON_PATH IDE_MCP_CONFIG IA_FRAMEWORK_DIR CONFIG_FILE
# Merges MCP entry into ~/.claude/settings.json under "mcp" key.
# ──────────────────────────────────────────────────────────────────────────────
install_mcp_claude() {
  local mcp_json="$1"
  local config_file="$2"
  local ia_dir="$3"
  local config_path="$4"

  mkdir -p "$(dirname "$config_file")"
  [ -f "$config_file" ] || echo '{}' > "$config_file"

  local resolved_cmd
  resolved_cmd=$(_resolve_mcp_command "$mcp_json" "$ia_dir" "$config_path")

  MCP_JSON_PATH="$mcp_json" \
  MCP_CONFIG_FILE="$config_file" \
  MCP_RESOLVED_CMD="$resolved_cmd" \
  IA_FRAMEWORK_DIR="$ia_dir" \
  IA_CONFIG_PATH="$config_path" \
  node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const mcp = JSON.parse(readFileSync(process.env.MCP_JSON_PATH, 'utf8'));
const f = process.env.MCP_CONFIG_FILE;
const resolvedCmd = JSON.parse(process.env.MCP_RESOLVED_CMD);

let cfg = {};
try { cfg = JSON.parse(readFileSync(f, 'utf8')); } catch {}
// Claude Code uses "mcpServers" key
cfg.mcpServers ??= {};

const entry = { command: resolvedCmd[0], args: resolvedCmd.slice(1) };
if (resolvedCmd[0] === 'npx') {
  entry.command = 'npx';
}
if (mcp.environment && Object.keys(mcp.environment).length > 0) {
  const iaDir = process.env.IA_FRAMEWORK_DIR;
  const cfgPath = process.env.IA_CONFIG_PATH;
  const env = {};
  for (const [k, v] of Object.entries(mcp.environment)) {
    env[k] = v
      .replace('{{IA_FRAMEWORK_DIR}}', iaDir)
      .replace('{{CONFIG_PATH}}', cfgPath)
      .replace('{{MCP_BIN}}', `${iaDir}/packages/mcp-server/dist/bin.js`);
  }
  if (Object.keys(env).some(k => env[k])) entry.env = env;
}

cfg.mcpServers[mcp.id] = entry;
writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
EOF
}

# ──────────────────────────────────────────────────────────────────────────────
# install_mcp_vscode MCP_JSON_PATH IDE_MCP_CONFIG IA_FRAMEWORK_DIR CONFIG_FILE
# ──────────────────────────────────────────────────────────────────────────────
install_mcp_vscode() {
  local mcp_json="$1"
  local config_file="$2"
  local ia_dir="$3"
  local config_path="$4"

  mkdir -p "$(dirname "$config_file")"
  [ -f "$config_file" ] || echo '{"servers":{}}' > "$config_file"

  local resolved_cmd
  resolved_cmd=$(_resolve_mcp_command "$mcp_json" "$ia_dir" "$config_path")

  MCP_JSON_PATH="$mcp_json" \
  MCP_CONFIG_FILE="$config_file" \
  MCP_RESOLVED_CMD="$resolved_cmd" \
  IA_FRAMEWORK_DIR="$ia_dir" \
  IA_CONFIG_PATH="$config_path" \
  node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const mcp = JSON.parse(readFileSync(process.env.MCP_JSON_PATH, 'utf8'));
const f = process.env.MCP_CONFIG_FILE;
const resolvedCmd = JSON.parse(process.env.MCP_RESOLVED_CMD);

let cfg = { servers: {} };
try { cfg = JSON.parse(readFileSync(f, 'utf8')); } catch {}
cfg.servers ??= {};

cfg.servers[mcp.id] = {
  command: resolvedCmd[0],
  args: resolvedCmd.slice(1),
  type: 'stdio'
};
writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
EOF
}

# ──────────────────────────────────────────────────────────────────────────────
# install_mcp_codex MCP_JSON_PATH IDE_MCP_CONFIG IA_FRAMEWORK_DIR CONFIG_FILE
# Appends MCP entry to Codex's config.toml.
# ──────────────────────────────────────────────────────────────────────────────
install_mcp_codex() {
  local mcp_json="$1"
  local config_file="$2"
  local ia_dir="$3"
  local config_path="$4"

  mkdir -p "$(dirname "$config_file")"
  [ -f "$config_file" ] || touch "$config_file"

  local resolved_cmd
  resolved_cmd=$(_resolve_mcp_command "$mcp_json" "$ia_dir" "$config_path")

  MCP_JSON_PATH="$mcp_json" \
  MCP_RESOLVED_CMD="$resolved_cmd" \
  node --input-type=module <<'EOF'
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
const mcp = JSON.parse(readFileSync(process.env.MCP_JSON_PATH, 'utf8'));
const cmd = JSON.parse(process.env.MCP_RESOLVED_CMD);
const toml = `\n[mcp.${mcp.id}]\ncommand = ${JSON.stringify(cmd[0])}\nargs = [${cmd.slice(1).map(a => JSON.stringify(a)).join(', ')}]\n`;
appendFileSync(process.env.HOME + '/.codex/config.toml', toml);
EOF
}

# ──────────────────────────────────────────────────────────────────────────────
# uninstall_mcp MCP_ID IDE_MCP_CONFIG IDE_MCP_FORMAT
# ──────────────────────────────────────────────────────────────────────────────
uninstall_mcp() {
  local mcp_id="$1"
  local config_file="$2"
  local format="$3"

  [ -f "$config_file" ] || return 0

  case "$format" in
    opencode-json)
      MCP_REMOVE_ID="$mcp_id" MCP_CONFIG_FILE="$config_file" \
      node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const f = process.env.MCP_CONFIG_FILE;
const id = process.env.MCP_REMOVE_ID;
let cfg = {};
try { cfg = JSON.parse(readFileSync(f, 'utf8')); } catch { process.exit(0); }
if (cfg.mcp) delete cfg.mcp[id];
writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
EOF
      ;;
    claude-json)
      MCP_REMOVE_ID="$mcp_id" MCP_CONFIG_FILE="$config_file" \
      node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const f = process.env.MCP_CONFIG_FILE;
const id = process.env.MCP_REMOVE_ID;
let cfg = {};
try { cfg = JSON.parse(readFileSync(f, 'utf8')); } catch { process.exit(0); }
if (cfg.mcpServers) delete cfg.mcpServers[id];
writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
EOF
      ;;
    vscode-json)
      MCP_REMOVE_ID="$mcp_id" MCP_CONFIG_FILE="$config_file" \
      node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const f = process.env.MCP_CONFIG_FILE;
const id = process.env.MCP_REMOVE_ID;
let cfg = {};
try { cfg = JSON.parse(readFileSync(f, 'utf8')); } catch { process.exit(0); }
if (cfg.servers) delete cfg.servers[id];
writeFileSync(f, JSON.stringify(cfg, null, 2) + '\n');
EOF
      ;;
    codex-toml)
      # Remove the [mcp.ID] section from TOML
      local tmpfile="${config_file}.tmp"
      python3 - "$config_file" "$mcp_id" "$tmpfile" <<'PYEOF'
import sys, re
src, mcp_id, dest = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src).read()
pattern = r'\n\[mcp\.' + re.escape(mcp_id) + r'\][^\[]*'
text = re.sub(pattern, '', text)
open(dest, 'w').write(text)
PYEOF
      mv "$tmpfile" "$config_file"
      ;;
  esac
}

# ──────────────────────────────────────────────────────────────────────────────
# install_mcp_for_ide MCP_ID IDE_ID IA_FRAMEWORK_DIR CONFIG_FILE
# Dispatcher — routes to correct format handler.
# ──────────────────────────────────────────────────────────────────────────────
install_mcp_for_ide() {
  local mcp_id="$1"
  local ide_id="$2"
  local ia_dir="$3"
  local config_path="$4"

  source_ide_descriptor "$ide_id" || return 1

  # Skip IDEs with no MCP config format defined (e.g. gemini, windsurf stubs)
  if [ -z "${IDE_MCP_FORMAT:-}" ] || [ -z "${IDE_MCP_CONFIG:-}" ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} MCP configuration not yet supported for ${IDE_NAME:-$ide_id} — skipping"
    return 0
  fi

  local mcp_dir
  # Find the mcp.json for this mcp_id
  mcp_dir=$(find "${ia_dir}/mcps" -name "mcp.json" -exec grep -l "\"id\": \"${mcp_id}\"" {} \; 2>/dev/null | head -1)
  if [ -z "$mcp_dir" ]; then
    echo -e "  ${RED:-}✗${NC:-} No mcp.json found for id: ${mcp_id}"
    return 1
  fi

  # Notify if ia-framework binary missing (write config anyway per FR-005)
  if grep -q '"requires_build": true' "$mcp_dir" 2>/dev/null; then
    local mcp_bin="${ia_dir}/packages/mcp-server/dist/bin.js"
    if [ ! -f "$mcp_bin" ]; then
      echo -e "  ${YELLOW:-}ℹ${NC:-} ia-framework MCP binary not found — config will be written but IDE will fail to start it until 'pnpm build' is run."
    fi
  fi

  case "$IDE_MCP_FORMAT" in
    opencode-json) install_mcp_opencode "$mcp_dir" "$IDE_MCP_CONFIG" "$ia_dir" "$config_path" ;;
    claude-json)   install_mcp_claude   "$mcp_dir" "$IDE_MCP_CONFIG" "$ia_dir" "$config_path" ;;
    vscode-json)   install_mcp_vscode   "$mcp_dir" "$IDE_MCP_CONFIG" "$ia_dir" "$config_path" ;;
    codex-toml)    install_mcp_codex    "$mcp_dir" "$IDE_MCP_CONFIG" "$ia_dir" "$config_path" ;;
  esac

  unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
        IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
        IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
        IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS
}

# ──────────────────────────────────────────────────────────────────────────────
# configure_mcps IA_FRAMEWORK_DIR CONFIG_FILE
# Main entry point. Called from install.sh Step 5.1.
# ──────────────────────────────────────────────────────────────────────────────
configure_mcps() {
  local ia_dir="${1:-${SCRIPT_DIR:-$(pwd)}}"
  local config_path="${2:-${ia_dir}/.ia-framework/project.json}"

  echo -e "${BOLD:-}Step 5.1: Configure MCPs${NC:-}"

  # Source shared helpers
  # shellcheck source=scripts/installer-helpers.sh
  source "${ia_dir}/scripts/installer-helpers.sh"

  # Detect and select IDEs
  detect_ides
  if [ "${#DETECTED_IDES[@]}" -eq 0 ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} No IDEs detected — MCP configuration skipped."
    return 0
  fi

  echo -e "  ${YELLOW:-}→${NC:-} Select which IDE(s) to configure MCPs for:"
  prompt_ide_select

  if [ "${#SELECTED_IDES[@]}" -eq 0 ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} No IDEs selected — skipping MCP configuration."
    return 0
  fi

  # Scan available MCPs
  scan_mcps
  if [ "${#AVAILABLE_MCPS[@]}" -eq 0 ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} No MCP descriptors found in mcps/ — skipping."
    return 0
  fi

  echo ""
  echo -e "  ${YELLOW:-}→${NC:-} Select which MCPs to install:"
  prompt_mcp_select

  if [ "${#SELECTED_MCPS[@]}" -eq 0 ]; then
    echo -e "  ${YELLOW:-}⚠${NC:-} No MCPs selected."
    return 0
  fi

  echo ""

  # If the postgres MCP is selected, configure the DB connection now so that
  # .ia-framework/db.json exists (created if missing) and the DSN is available
  # for the connection-string substitution during install below.
  local _pg_selected=""
  for mcp_id in "${SELECTED_MCPS[@]}"; do
    [ "$mcp_id" = "postgres" ] && _pg_selected="yes"
  done
  if [ -n "$_pg_selected" ]; then
    configure_postgres_db_json "$ia_dir" "$config_path"
    echo ""
  fi

  # For each selected IDE × each selected MCP
  for ide_id in "${SELECTED_IDES[@]}"; do
    source_ide_descriptor "$ide_id" || continue
    local ide_name="${IDE_NAME:-$ide_id}"
    local mcp_config="${IDE_MCP_CONFIG:-}"
    local mcp_format="${IDE_MCP_FORMAT:-}"
    unset IDE_ID IDE_NAME IDE_DETECT_PATH IDE_GLOBAL_DIR \
          IDE_SKILLS_DIR IDE_AGENTS_DIR IDE_COMMANDS_DIR IDE_HOOKS_DIR \
          IDE_MCP_CONFIG IDE_MCP_FORMAT IDE_AGENT_FORMAT \
          IDE_SUPPORTS_SYMLINK IDE_SUPPORTS_HOOKS IDE_SUPPORTS_COMMANDS

    if [ -z "$mcp_format" ]; then
      echo -e "  ${YELLOW:-}⚠${NC:-} ${ide_name}: MCP config not yet supported — skipping"
      continue
    fi

    echo -e "  ${BOLD:-}→ ${ide_name}${NC:-}"

    for mcp_id in "${SELECTED_MCPS[@]}"; do
      local state
      state=$(detect_mcp_state "$mcp_id" "$mcp_config" "$mcp_format")

      if [ "$state" = "configured" ] && ! is_noninteractive; then
        echo -e "    ${BLUE:-}•${NC:-} ${mcp_id} — already configured"
        local action
        read -rp "      [skip/reinstall/uninstall] (skip): " action
        action="${action:-skip}"
        case "$(echo "$action" | tr '[:upper:]' '[:lower:]')" in
          reinstall)
            uninstall_mcp "$mcp_id" "$mcp_config" "$mcp_format"
            install_mcp_for_ide "$mcp_id" "$ide_id" "$ia_dir" "$config_path"
            echo -e "    ${GREEN:-}✓${NC:-} ${mcp_id} reinstalled"
            ;;
          uninstall)
            uninstall_mcp "$mcp_id" "$mcp_config" "$mcp_format"
            echo -e "    ${GREEN:-}✓${NC:-} ${mcp_id} removed"
            ;;
          *)
            echo -e "    ${BLUE:-}→${NC:-} ${mcp_id} skipped"
            ;;
        esac
      elif [ "$state" = "configured" ] && is_noninteractive; then
        echo -e "    ${BLUE:-}→${NC:-} ${mcp_id} already configured — skipping"
      else
        install_mcp_for_ide "$mcp_id" "$ide_id" "$ia_dir" "$config_path"
        echo -e "    ${GREEN:-}✓${NC:-} ${mcp_id} configured"
      fi
    done
    echo ""
  done

  echo -e "  ${GREEN:-}✓${NC:-} MCP configuration complete. Restart your IDE to activate."
}
