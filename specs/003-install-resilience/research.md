# Research: Install Script Resilience & Defaults

**Feature**: 003-install-resilience | **Date**: 2026-06-03

## Research Tasks & Findings

### 1. Node Version Gate Strategy

**Decision**: Add a dedicated gate function early in `install.sh` that checks `node --version`, displays a formatted box on failure, offers to install, re-verifies after install, and exits if not active.

**Rationale**: The current flow calls `check_node` and `install_node` but does not re-verify that the installed version is _active_. The spec requires a post-install re-check because `install_node` (via brew/apt) may install node 22 but the user's shell still resolves an older nvm-managed version.

**Alternatives considered**:

- Automatic `nvm use 22` — rejected because we can't reliably source nvm in a non-interactive script and it mutates the user's shell state.
- Just warn and continue — rejected because all subsequent steps (pnpm install, build) will fail.

---

### 2. MCP Log Capture Approach

**Decision**: Modify `configure-opencode.sh` to wrap the MCP command with stderr redirection (`2>> .ia-framework/logs/mcp-server.log`). Create the logs directory in `install.sh`. Truncate the log on each install run.

**Rationale**: The MCP server already outputs structured pino JSON to stderr. Capturing stderr to a file is the simplest approach with zero code changes to the MCP server itself. The dashboard-api reads the file via a new `/api/logs` route.

**Alternatives considered**:

- pino file transport inside MCP server — rejected because it requires MCP server code changes and the server runs as a subprocess of OpenCode (stdout is stdio transport, can't redirect from inside).
- Shared volume with syslog — over-engineered for local-first.

---

### 3. Dashboard Logs API Pattern

**Decision**: Create `packages/dashboard-api/src/routes/logs.ts` exporting a `logsRouter(deps)` factory following existing pattern. Mount at `/api/logs`. Read file with `fs.readFile`, split lines, parse JSON, filter by level, limit to N entries (default 100, from tail).

**Rationale**: Matches existing route patterns exactly. File-based reading is simple and sufficient for a single-user local tool. No database needed.

**Alternatives considered**:

- SQLite log storage — adds complexity with no benefit for tail-reading latest logs.
- WebSocket streaming — spec explicitly says polling every 5s is acceptable for v1.

---

### 4. Dashboard Logs UI Pattern

**Decision**: Create `apps/dashboard/src/pages/LogsPage.tsx` with level filter dropdown, refresh button, optional auto-refresh toggle (5s polling). Add route `/logs` and nav item in App.tsx Layout.

**Rationale**: Follows existing page patterns. Uses React Router v6 nested under Layout. Level filter and refresh match spec requirements.

**Alternatives considered**:

- Virtual scrolling for large logs — deferred; API returns max 100 lines so not needed for v1.

---

### 5. project.json Multi-Repo Format & Defaults

**Decision**: Update `scripts/init-config.sh` fallback template to use `repos` array (with `name` derived from basename), set embedding model to `qwen3-embedding:0.6b` with dimensions 1024 and prefixes object, set vectorStore host to `localhost`. Add merge logic for existing configs via a node script.

**Rationale**: The existing `project.json` in `.ia-framework/` already uses the correct format (it was manually updated). The fallback template in `init-config.sh` line 98-133 still uses the old `targetProjectPath` format and wrong defaults (`nomic-embed-text`, `qdrant` host). This must be fixed.

**Alternatives considered**:

- Only fix the CLI `init` command — not sufficient because the fallback template is used when CLI init fails.

---

### 6. Config Merge Strategy for Existing Installs

**Decision**: Before writing config, back up to `project.json.bak`. Use a small inline node script (or jq) to merge missing fields without overwriting existing values. Add `prefixes` to embedding if missing, change `host` from `qdrant` to `localhost` only if it equals `qdrant`, convert `targetProjectPath` to `repos` array if old format detected.

**Rationale**: Spec FR-009 requires merge behavior with backup. Node.js is guaranteed available at this point in the script (past the version gate).

**Alternatives considered**:

- Always overwrite — rejected, would destroy user customizations.
- jq dependency — rejected, not guaranteed installed.

---

### 7. Ollama Default Model

**Decision**: Set `SELECTED_EMBED_MODEL` default to `qwen3-embedding:0.6b` and `SELECTED_EMBED_DIMS` to `1024` in the Ollama install/selection step. Pull the model automatically if Ollama is available.

**Rationale**: Spec FR-013 requires this default. The model produces 1024-dim vectors suitable for the framework's retrieval pipeline.

**Alternatives considered**:

- Keep `nomic-embed-text` as default — rejected per spec requirement.
