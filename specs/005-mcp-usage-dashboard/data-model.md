# Data Model: MCP Usage Dashboard

**Date**: 2026-06-03

## Entities

### McpRequest

Represents a single MCP tool invocation with its full context and response.

| Field            | Type            | Description                                            |
| ---------------- | --------------- | ------------------------------------------------------ |
| id               | TEXT (UUID)     | Primary key                                            |
| session_id       | TEXT            | Session identifier (from server startup)               |
| tool_name        | TEXT            | MCP tool invoked (e.g., `search_codebase`, `get_file`) |
| input_params     | TEXT (JSON)     | Full input parameters as JSON                          |
| response_content | TEXT            | Full response content sent to the LLM                  |
| input_tokens     | INTEGER         | Token count for input (query + params)                 |
| output_tokens    | INTEGER         | Token count for response content                       |
| duration_ms      | INTEGER         | Request duration in milliseconds                       |
| timestamp        | TEXT (ISO 8601) | When the request was received                          |
| is_truncated     | INTEGER (0/1)   | Whether response was truncated due to size limit       |

**Indexes**:

- `idx_mcp_requests_timestamp` on `timestamp` (for date range queries)
- `idx_mcp_requests_tool_name` on `tool_name` (for filtering)

### Relationships

- McpRequest has no foreign keys to `rag_events` — they are independent tracking systems
- McpRequest.session_id correlates with rag_events.session_id when the tool is `search_codebase`

## State Transitions

None — McpRequest is immutable once written (append-only log).

## Validation Rules

- `id`: Must be valid UUID v4
- `tool_name`: Non-empty string
- `input_params`: Must be valid JSON
- `response_content`: Max 512KB (configurable), truncated with marker if exceeded
- `input_tokens` / `output_tokens`: Non-negative integers
- `duration_ms`: Non-negative integer
- `timestamp`: Valid ISO 8601 datetime string

## Aggregation Views (computed, not stored)

### RequestSummaryStats

| Field               | Type    | Description                       |
| ------------------- | ------- | --------------------------------- |
| total_requests      | INTEGER | Total number of recorded requests |
| total_input_tokens  | INTEGER | Sum of all input tokens           |
| total_output_tokens | INTEGER | Sum of all output tokens          |
| avg_duration_ms     | REAL    | Average request duration          |
| requests_today      | INTEGER | Requests in the current day       |

### DailyRequestStats

| Field               | Type    | Description                      |
| ------------------- | ------- | -------------------------------- |
| date                | TEXT    | Date (YYYY-MM-DD)                |
| request_count       | INTEGER | Number of requests that day      |
| total_input_tokens  | INTEGER | Sum of input tokens for the day  |
| total_output_tokens | INTEGER | Sum of output tokens for the day |
| avg_duration_ms     | REAL    | Average duration for the day     |
