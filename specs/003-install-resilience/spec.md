# Feature Specification: Install Script Resilience & Defaults

**Feature Branch**: `003-install-resilience`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "Improve install.sh resilience. Verify if mandatory node version is available and set, if not show it to user and ask him to install or set, before proceed with the other steps. Only installing maybe wouldn't be enough. The user should set this version as the default/current. For the ollama part set qwen3-embedding:0.6b as the default LLM for embedding and when writing the project.json add prefixes in the embedding object. When MCP fails to start we should see its logs somewhere. Update the install.sh also to write the project.json ready for handling multiple repos. And in the vectorStore set localhost as default host."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Node Version Gate (Priority: P1)

As a developer running `./install.sh`, I want the installer to immediately check whether Node.js 22+ is the currently active version, clearly inform me if it's not, offer to install it for me, and gracefully stop if it's still not set as current — so I never encounter cryptic build failures halfway through the installation process.

**Why this priority**: Without the correct Node version active, every subsequent step (pnpm install, build, CLI link) will fail. This is the most critical gate.

**Independent Test**: Run `./install.sh` with Node 18 active — installer should display a clear message, offer to install, and exit cleanly without executing any build steps.

**Acceptance Scenarios**:

1. **Given** Node.js is not installed, **When** the user runs `./install.sh`, **Then** the installer displays a visible box showing "Node.js 22+ is required but not found", suggests nvm/fnm install commands, asks if user wants the installer to install it, and if user declines, exits with code 1 without running any further steps.
2. **Given** Node.js 18 is active (but 22 is available via nvm), **When** the user runs `./install.sh`, **Then** the installer shows the detected version, explains that 22+ must be the _active_ version, suggests `nvm use 22`, asks if user wants it installed, and exits gracefully if not resolved.
3. **Given** the user accepts the install offer, **When** Node 22 is installed but the shell still reports Node 18 as active, **Then** the installer explains that the user needs to activate Node 22 (e.g., `nvm use 22`) and exits with code 1.
4. **Given** Node.js 22+ is already the active version, **When** the user runs `./install.sh`, **Then** installation proceeds normally past the Node check.

---

### User Story 2 - MCP Log Visibility in Dashboard (Priority: P2)

As a developer debugging MCP server startup failures, I want to view the MCP server logs in the ia-framework dashboard — so I can quickly diagnose connection or configuration issues without hunting for stderr output.

**Why this priority**: MCP failures are currently silent from the user's perspective. Without log visibility, debugging requires manual stderr inspection which most users won't know how to do.

**Independent Test**: Kill the MCP server (or misconfigure it), open the dashboard at `/logs`, and verify error log lines appear with timestamps, levels, and messages.

**Acceptance Scenarios**:

1. **Given** the MCP server has been running and producing log output, **When** the user navigates to the Logs page in the dashboard, **Then** they see the most recent 100 log lines with timestamps, severity levels, and messages.
2. **Given** the MCP server failed to start due to a configuration error, **When** the user opens the Logs page, **Then** they see the error-level log entries explaining the failure cause.
3. **Given** the user selects "error" in the level filter, **When** logs are displayed, **Then** only error-level (and above) entries are shown.
4. **Given** the user clicks the refresh button or auto-refresh is enabled, **When** new log lines are written, **Then** the display updates within 5 seconds.
5. **Given** the install script is run again, **When** it completes the log setup step, **Then** the previous log file is truncated (rotation) and fresh logging begins.

---

### User Story 3 - Correct Defaults Out of the Box (Priority: P3)

As a first-time user, I want the installer to write a `project.json` with the correct embedding model (`qwen3-embedding:0.6b`), document/query prefixes, multi-repo structure, and `localhost` as the vector store host — so everything works without manual configuration edits.

**Why this priority**: Incorrect defaults cause silent failures at index/search time that are hard to diagnose. Getting defaults right eliminates the most common post-install support issues.

**Independent Test**: Run `./install.sh` on a fresh setup, inspect the generated `.ia-framework/project.json`, and verify all expected fields are present with correct values.

**Acceptance Scenarios**:

1. **Given** no existing `project.json`, **When** the installer writes the config, **Then** it uses the `repos` array format (not `targetProjectPath`) with the entered path as a single entry including a derived `name`.
2. **Given** the installer writes the config, **When** inspecting the embedding section, **Then** it contains `"model": "qwen3-embedding:0.6b"`, `"dimensions": 1024`, and a `"prefixes"` object with `"document": "search_document: "` and `"query": "search_query: "`.
3. **Given** the installer writes the config, **When** inspecting the vectorStore section, **Then** `"host"` is `"localhost"` (not `"qdrant"`).
4. **Given** the installer completes, **When** the user reads the terminal output, **Then** they see a hint explaining how to add more repositories to the `repos` array.
5. **Given** Ollama is installed but `qwen3-embedding:0.6b` is not pulled, **When** the installer reaches the model selection step, **Then** it defaults to `qwen3-embedding:0.6b` and pulls it automatically.

---

### Edge Cases

- What happens when the log file doesn't exist yet (first dashboard load before MCP has ever run)? The API returns an empty array, the UI shows "No logs yet."
- What happens when the log file grows very large? The API only reads the last N lines (default 100), keeping response size bounded.
- What happens if `nvm` / `fnm` are not installed and the user declines the install offer? The installer exits with a clear message pointing to https://nodejs.org for manual install.
- What happens if Ollama fails to pull `qwen3-embedding:0.6b`? Falls back to prompting the user for an alternative model (existing behavior).
- What happens when `project.json` exists but uses the old `targetProjectPath` format? The installer merges: converts to `repos` array format preserving the existing path, and adds missing fields (`prefixes`, `host`) without overwriting user-set values.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Installer MUST check that Node.js 22+ is the currently active version before executing any build steps.
- **FR-002**: Installer MUST display the detected Node version (or "not found") and the required version in a clearly visible formatted block when the check fails.
- **FR-003**: Installer MUST offer the user the option to install Node 22 when it's not available, and call the existing `install_node` function if accepted.
- **FR-004**: Installer MUST re-verify Node 22+ is active after installation attempt, and exit with a clear "please activate" message if it's installed but not set as current.
- **FR-005**: Installer MUST exit with code 1 and not proceed to any further steps when Node 22+ is not the active version.
- **FR-006**: Installer MUST create the `.ia-framework/logs/` directory during setup.
- **FR-007**: Installer MUST truncate `.ia-framework/logs/mcp-server.log` on each run (log rotation).
- **FR-008**: The MCP server command in OpenCode config MUST redirect stderr to `.ia-framework/logs/mcp-server.log` (append mode).
- **FR-009**: The installer MUST back up `project.json` to `project.json.bak` (overwriting any previous backup) before merging. It MUST merge missing fields into an existing `project.json` (preserving user values) or create a new one if absent. New configs MUST use the `repos` array format with the entered path as a single entry.
- **FR-010**: The `project.json` embedding section MUST default to model `qwen3-embedding:0.6b` with dimensions `1024` and include a `prefixes` object with `"document": "search_document: "` and `"query": "search_query: "`. Existing values MUST NOT be overwritten.
- **FR-011**: The `project.json` vectorStore section MUST set `"host": "localhost"` if not already present.
- **FR-012**: Installer MUST print a hint after config creation explaining how to add more repos.
- **FR-013**: The Ollama model selection MUST default to `qwen3-embedding:0.6b` and pull it if not available locally.
- **FR-014**: Dashboard API MUST expose `GET /api/logs` endpoint that reads, parses, and returns structured log entries from `.ia-framework/logs/mcp-server.log`.
- **FR-015**: Dashboard API logs endpoint MUST support filtering by level (error, warn, info, debug) and limiting number of returned lines.
- **FR-016**: Dashboard UI MUST include a top-level "Logs" page accessible from the main navigation.
- **FR-017**: Dashboard Logs page MUST display log entries with timestamp, level (color-coded), and message.
- **FR-018**: Dashboard Logs page MUST provide a level filter dropdown and a manual refresh button.
- **FR-019**: Dashboard Logs page MUST support optional auto-refresh via polling every 5 seconds.

### Key Entities

- **Log Entry**: Represents a single structured log line — has timestamp, level (numeric/string), component name, message, and optional metadata fields. Produced by pino in JSON format.
- **Repo Entry**: Represents a repository in the multi-repo config — has a name (derived from path basename) and an absolute path.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users with an incorrect Node version see the error message and never reach the build step — 100% of failed installs due to Node version are caught at step 1.
- **SC-002**: Users can view MCP server error logs within 5 seconds of opening the dashboard Logs page.
- **SC-003**: A fresh install produces a valid `project.json` that passes the framework's config schema validation without any manual edits.
- **SC-004**: The MCP server log file is populated with structured entries when the server starts or fails, and is readable by the dashboard API.
- **SC-005**: Time to diagnose an MCP startup failure is reduced from "unknown/hunting for stderr" to under 30 seconds via the Logs page.

## Clarifications

### Session 2026-06-03

- Q: When project.json already exists but is missing new fields, what should the installer do? → A: Merge — add missing fields, preserve existing values.
- Q: What shell environment must install.sh support? → A: Bash only (#!/bin/bash).
- Q: Should there be a max log file size limit between installs? → A: No size cap — truncate-on-install is sufficient.
- Q: Does the dashboard already exist or is it new? → A: Existing dashboard — add Logs page/route.
- Q: Should the installer back up project.json before merging? → A: Yes — create project.json.bak, overwritten on each install (single backup only).

## Assumptions

- Users manage Node.js versions via nvm, fnm, or system package manager — the installer does not manage version switching, only installation.
- The install script requires Bash (#!/bin/bash) — POSIX sh and other shells are not supported.
- The dashboard container has read access to `.ia-framework/logs/` via the existing bind mount.
- The dashboard application already exists; the Logs page is a new route added to the existing UI and API.
- Pino's JSON-per-line format is stable and parseable — no multi-line log entries.
- The `qwen3-embedding:0.6b` model is available on Ollama's registry and produces 1024-dimensional vectors.
- Polling every 5 seconds is acceptable latency for log viewing (no WebSocket/SSE needed for v1).
- Log rotation by truncation on each install run is sufficient — no size-based rotation needed between installs.
