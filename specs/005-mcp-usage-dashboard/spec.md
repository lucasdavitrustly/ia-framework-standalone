# Feature Specification: MCP Usage Dashboard

**Feature Branch**: `005-mcp-usage-dashboard`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "Update the dashboard with query and token usage and the response of each request of MCP Server. Currently it only displays when we are running some benchmark, but I want to track the MCP Server at all, when for instance, OpenCode or any other IDE/LLM calls the MCP. Track mainly the Token Usage and the answer given to the LLMs, time, with date."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - View All MCP Request Activity (Priority: P1)

As a developer using the ia-framework MCP server, I want to see every request made to the MCP server (regardless of whether it's from a benchmark run, OpenCode, or any other IDE/LLM client), so I can understand how the server is being used and what responses are being returned.

**Why this priority**: This is the core tracking capability. Without capturing all MCP requests, no other dashboard features work.

**Independent Test**: Can be tested by making MCP tool calls from any client and verifying they appear in the dashboard events list with full details.

**Acceptance Scenarios**:

1. **Given** the MCP server is running and connected to an IDE (e.g., OpenCode), **When** the IDE makes a `search_codebase` tool call, **Then** the request is recorded with timestamp, tool name, query parameters, token usage, and full response content.
2. **Given** multiple MCP tool calls have been recorded, **When** I access the dashboard metrics endpoint, **Then** I see all requests listed chronologically with date and time.
3. **Given** the MCP server receives requests from different sources (benchmark runner, OpenCode, another IDE), **When** I view the request log, **Then** all requests are captured identically regardless of source.

---

### User Story 2 - Track Token Usage Per Request (Priority: P1)

As a developer, I want to see the token usage for each individual MCP request (both input tokens from the query and output tokens from the response), so I can monitor consumption and optimize my queries.

**Why this priority**: Token usage is explicitly called out as the primary metric to track. Understanding per-request cost is essential.

**Independent Test**: Can be tested by making a single MCP tool call and verifying the token count for both query and response is recorded and visible.

**Acceptance Scenarios**:

1. **Given** an MCP tool call is made, **When** the response is generated, **Then** the system records input tokens (query + parameters) and output tokens (response content) separately.
2. **Given** multiple requests have been recorded, **When** I view the metrics summary, **Then** I see aggregated token usage totals, averages per request, and breakdown by time period.
3. **Given** a request produces a large response (e.g., multiple file chunks), **When** I view that request's details, **Then** the token count accurately reflects the full response size.

---

### User Story 3 - View Response Content for Each Request (Priority: P2)

As a developer, I want to see what answer was given to the LLM for each MCP request, so I can debug retrieval quality and understand what context the LLM received.

**Why this priority**: Seeing actual responses enables debugging and quality assessment beyond just token counts.

**Independent Test**: Can be tested by making an MCP tool call, then querying the events endpoint and verifying the full response body is stored and retrievable.

**Acceptance Scenarios**:

1. **Given** an MCP request has been recorded, **When** I view the request details, **Then** I can see the full response content that was sent back to the LLM.
2. **Given** a search request returned multiple code chunks, **When** I view the response, **Then** each chunk is visible with its file path, score, and content.
3. **Given** I want to compare responses over time for similar queries, **When** I filter events by tool name and query text, **Then** I can see how responses differ.

---

### User Story 4 - Filter and Browse Request History (Priority: P3)

As a developer, I want to filter the request history by date range, tool name, and source, so I can find specific interactions quickly.

**Why this priority**: As the log grows, filtering becomes necessary for usability, but basic tracking works without it.

**Independent Test**: Can be tested by recording several requests across different tools/dates, then using filter parameters to narrow results.

**Acceptance Scenarios**:

1. **Given** requests have been recorded over multiple days, **When** I filter by a specific date range, **Then** only requests within that range are returned.
2. **Given** requests from different MCP tools exist, **When** I filter by tool name (e.g., `search_codebase`), **Then** only matching requests are shown.

---

### Edge Cases

- What happens when the MCP server processes a request but the response is very large (e.g., >100KB)? The system should still record it but may truncate stored response content at a reasonable limit.
- How does the system handle concurrent requests from multiple clients? Each request should be independently recorded with its own timestamp.
- What happens if the metrics database is unavailable? The MCP server should continue functioning normally (logging failures should not block tool responses).
- What happens when the stored events grow very large over time? The system should support pagination and eventually a retention/cleanup policy.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST record every MCP tool call regardless of the calling client (IDE, benchmark runner, CLI, etc.).
- **FR-002**: System MUST capture the following for each request: timestamp (date + time), tool name, input parameters/query, response content, input token count, output token count, and request duration.
- **FR-003**: System MUST persist recorded requests across server restarts (durable storage).
- **FR-004**: System MUST expose recorded requests through the dashboard API with pagination support.
- **FR-005**: System MUST provide an endpoint to retrieve the full response content of a specific request.
- **FR-006**: System MUST calculate and expose aggregated token usage metrics (totals, averages, by time period).
- **FR-007**: System MUST record request duration (time from request received to response sent).
- **FR-008**: System MUST support filtering events by date range and tool name.
- **FR-009**: System MUST NOT degrade MCP server response performance when recording requests (recording should be non-blocking to the response path).
- **FR-010**: System MUST store response content up to a configurable size limit, truncating with an indication when exceeded.

### Key Entities

- **MCP Request Event**: Represents a single tool invocation — includes timestamp, tool name, input parameters, response content, input tokens, output tokens, duration, and source identifier (if available).
- **Token Usage Summary**: Aggregated view of token consumption over a period — includes totals, averages, breakdown by tool, and breakdown by day.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of MCP tool calls (from any client) are recorded in the dashboard within 1 second of completion.
- **SC-002**: Users can retrieve the full response content of any recorded request through the dashboard API.
- **SC-003**: Token usage (input and output) is tracked with per-request granularity and queryable in aggregate.
- **SC-004**: Request history is browsable with pagination, supporting at least 10,000 stored events without performance degradation in retrieval.
- **SC-005**: Recording overhead adds less than 50ms to any MCP tool call response time.

## Assumptions

- The existing `MetricsStore` SQLite infrastructure will be extended (not replaced) to store additional request/response data.
- The existing `TokenCounter` heuristic (chars/4) is acceptable for token estimation; no external tokenizer is required.
- Response content storage does not require encryption since it contains code snippets already present in the repository.
- The dashboard API is accessed locally by the developer; no authentication is required.
- The current stdio transport means there's no direct "source identifier" for the calling client — all requests arrive through the same stdin channel. Source differentiation is a nice-to-have if metadata becomes available.
