# Feature Specification: Fix MCP Stderr Configuration

**Feature Branch**: `004-fix-mcp-stderr-config`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "In the spec 003, we add this in opencode mcp configuration `"stderr": "2>> /Users/rafael.goncalves/ia-framework/.ia-framework/logs/mcp-server.log"` to enable the mcp server logs on the dashboard, however it made the opencode fails to start."

## Clarifications

### Session 2026-06-03

- Q: How should stderr be captured given that OpenCode's MCP config schema has no `stderr` field (only `type`, `command`, `environment`, `enabled`, `timeout`)? → A: Use a wrapper shell command (`sh -c "node bin.js 2>> logfile"`) as the `command` array entry instead of an invalid `stderr` field.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - OpenCode Starts Successfully with MCP Logging (Priority: P1)

As a developer, I want OpenCode to start without errors when the ia-framework MCP server is configured — so that my development workflow is not blocked.

**Why this priority**: The current configuration completely prevents OpenCode from starting, which blocks all MCP-dependent work. This is a critical regression introduced by spec 003.

**Independent Test**: Can be fully tested by running `opencode` after installation and verifying it starts without errors and the ia-framework MCP server connects successfully.

**Acceptance Scenarios**:

1. **Given** the ia-framework install script has configured OpenCode's `opencode.json`, **When** the user launches OpenCode, **Then** OpenCode starts without errors and all configured MCP servers connect successfully.
2. **Given** an existing `opencode.json` with the broken `stderr` field from a previous install, **When** the user re-runs the install script, **Then** the configuration is corrected and OpenCode starts successfully afterward.

---

### User Story 2 - MCP Server Logs Are Captured to File (Priority: P2)

As a developer debugging MCP server issues, I want the MCP server's stderr output to be captured to `.ia-framework/logs/mcp-server.log` — so I can view logs in the dashboard without hunting for stderr output.

**Why this priority**: Log visibility was the original goal of the stderr redirect in spec 003. This must still work after the fix, just using the correct mechanism.

**Independent Test**: Can be fully tested by starting OpenCode, triggering an MCP tool call, and verifying log entries appear in `.ia-framework/logs/mcp-server.log`.

**Acceptance Scenarios**:

1. **Given** OpenCode is running with the ia-framework MCP server connected, **When** the MCP server writes log output to stderr, **Then** that output is appended to `.ia-framework/logs/mcp-server.log`.
2. **Given** the log file does not yet exist, **When** the MCP server starts and writes to stderr, **Then** the log file is created and entries are written.

---

### Edge Cases

- What happens when the log directory `.ia-framework/logs/` does not exist at MCP server start time?
- What happens when the log file has restrictive permissions?
- What happens when disk space is exhausted while writing logs?
- What happens on a fresh install where no prior `opencode.json` exists?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The install script MUST produce an `opencode.json` configuration that allows OpenCode to start without errors.
- **FR-002**: The MCP server's stderr output MUST be captured to `.ia-framework/logs/mcp-server.log` in append mode.
- **FR-003**: The install script MUST correct the broken `stderr` field when re-running on a system with an existing (broken) configuration.
- **FR-004**: The MCP server `command` in `opencode.json` MUST use a shell wrapper (`sh -c "node <bin> 2>> <logfile>"`) to redirect stderr to the log file, and the invalid `stderr` field MUST be removed.
- **FR-005**: The logs directory MUST be created during installation if it does not already exist.

### Key Entities

- **opencode.json**: The OpenCode configuration file that defines MCP server connections; located at `~/.config/opencode/opencode.json`.
- **MCP server log**: The file at `.ia-framework/logs/mcp-server.log` that captures stderr output from the ia-framework MCP server.
- **configure-opencode.sh**: The script at `scripts/configure-opencode.sh` responsible for writing the MCP configuration.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: OpenCode starts successfully within 5 seconds after running the install script on a clean system.
- **SC-002**: OpenCode starts successfully after running the install script on a system with the previously broken configuration.
- **SC-003**: MCP server log entries appear in `.ia-framework/logs/mcp-server.log` within 10 seconds of triggering an MCP tool call.
- **SC-004**: Zero users report OpenCode startup failures due to MCP stderr configuration after the fix is deployed.

## Assumptions

- OpenCode's MCP config schema does not support a `stderr` field; only `type`, `command`, `environment`, `enabled`, and `timeout` are valid. The fix uses a shell wrapper in the `command` array to perform stderr redirection.
- The MCP server already outputs structured pino JSON to stderr, which does not need to change.
- The dashboard log viewer reads from `.ia-framework/logs/mcp-server.log` and will continue to work once logs are properly captured.
- The fix will be applied to `scripts/configure-opencode.sh` to generate the correct `command` format and remove the invalid `stderr` field from existing configs.
