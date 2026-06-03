# Feature Specification: Fix TokenUsage Page Stale Data

**Feature Branch**: `007-fix-tokenusage-refresh`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "The tokenusage page is not updated the metrics from MCP server, it only shows old data"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - MCP metrics visible in dashboard after tool calls (Priority: P1)

A developer uses the MCP server tools (search_codebase, get_file, etc.) during a coding session. They open the TokenUsage dashboard page and expect to see metrics from their recent MCP tool calls. Currently, the dashboard only shows old/stale data because the SQLite database does not use WAL (Write-Ahead Logging) mode, causing the dashboard API process to not see writes committed by the separate MCP server process.

**Why this priority**: This is the core bug — without fixing the cross-process SQLite visibility issue, the dashboard is fundamentally broken for its primary use case. No amount of UI changes will help if the data layer doesn't surface new records.

**Independent Test**: Make an MCP tool call, then query the dashboard API's `/api/requests/stats` endpoint and verify the new call appears in the response.

**Acceptance Scenarios**:

1. **Given** the MCP server has processed a tool call and logged it to metrics.sqlite, **When** the dashboard API queries the same database file, **Then** the new record is visible in the query results without restarting the dashboard API.
2. **Given** the MCP server and dashboard API are running as separate processes, **When** both access metrics.sqlite concurrently (one writing, one reading), **Then** no database locking errors occur and reads always reflect the latest committed writes.
3. **Given** the dashboard API is reading stats, **When** the MCP server writes a new request record simultaneously, **Then** the read completes successfully (no SQLITE_BUSY errors) and subsequent reads include the new record.

---

### User Story 2 - Dashboard auto-refreshes to show latest metrics (Priority: P2)

A developer has the TokenUsage page open in their browser while actively using MCP tools. They expect the page to periodically update with new data without requiring a manual browser refresh.

**Why this priority**: Once the data layer correctly surfaces new records (P1), the UI should present fresh data automatically. This improves the monitoring experience but is not a blocker — users can still manually refresh the browser as a workaround.

**Independent Test**: Open the TokenUsage page, make several MCP tool calls, and observe that the displayed metrics update within the configured polling interval without any user interaction.

**Acceptance Scenarios**:

1. **Given** the TokenUsage page is open in the browser, **When** new MCP tool calls are logged, **Then** the page updates to show the new data within the polling interval.
2. **Given** the TokenUsage page is open and the dashboard API is unreachable (network error), **When** a polling cycle fails, **Then** the page continues to display the last successfully loaded data and does not show disruptive error states.
3. **Given** the user navigates away from the TokenUsage page, **When** the component unmounts, **Then** the polling timer is cleaned up (no memory leaks or background requests).

---

### Edge Cases

- What happens when the SQLite database file doesn't exist yet (first run before any MCP calls)?
- How does the system handle database file corruption or lock contention under heavy concurrent writes?
- What happens if the MCP server process crashes mid-write — does the dashboard degrade gracefully?
- What if the polling interval fires but the previous request is still in-flight?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The metrics database MUST use Write-Ahead Logging (WAL) journal mode to enable concurrent read/write access from separate processes.
- **FR-002**: New MCP tool call records written by the MCP server process MUST be visible to the dashboard API process on the next read operation without requiring process restart.
- **FR-003**: The TokenUsage page MUST periodically fetch updated stats from the API without user intervention.
- **FR-004**: The polling mechanism MUST clean up resources (timers, in-flight requests) when the page component unmounts.
- **FR-005**: The polling mechanism MUST NOT fire overlapping requests if a previous request is still pending.
- **FR-006**: The system MUST handle database locking gracefully — no unhandled SQLITE_BUSY errors should propagate to API responses.

### Key Entities

- **McpRequest**: A logged MCP tool invocation record (id, session_id, tool_name, input/output tokens, duration, timestamp)
- **MetricsStore**: The SQLite-backed persistence layer shared between MCP server (writer) and dashboard API (reader)

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: New MCP tool call data appears in the dashboard within 30 seconds of the call completing (polling interval + API response time).
- **SC-002**: Zero SQLITE_BUSY or locking errors occur during normal concurrent operation (one writer, one reader).
- **SC-003**: The TokenUsage page displays current-session data without requiring manual browser refresh.
- **SC-004**: No memory leaks or orphaned timers when navigating away from and back to the TokenUsage page.

## Assumptions

- The MCP server and dashboard API run as separate OS processes on the same machine, accessing the same SQLite file on disk.
- The `better-sqlite3` library supports WAL mode via `db.pragma('journal_mode = WAL')` and this is sufficient to resolve cross-process read visibility.
- A 30-second polling interval provides a reasonable balance between data freshness and resource usage for a local developer tool.
- The existing `withRequestLogging` wrapper in the MCP server is correctly invoked and the issue is purely at the database/read layer, not at the write layer.
