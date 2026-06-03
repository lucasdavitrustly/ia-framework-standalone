# Research: MCP Usage Dashboard

**Date**: 2026-06-03

## Decision 1: Where to Intercept MCP Tool Calls

**Decision**: Wrap each tool's handler at registration time in `createMcpServer()` to capture input/output/timing for all tools uniformly.

**Rationale**: The `@modelcontextprotocol/sdk` McpServer doesn't expose a generic middleware hook. However, since all tool registration happens in `server.ts` via `createMcpServer()`, we can create a wrapper function that decorates each tool's handler before registration. This keeps the interception centralized without modifying individual tool files.

**Alternatives considered**:

- Modifying each tool individually (like current `search_codebase` approach) — rejected: repetitive, error-prone, violates DRY
- Patching the McpServer transport layer — rejected: fragile, depends on SDK internals
- Using a proxy object around McpServer — rejected: over-engineered for this use case

## Decision 2: Storage Schema Extension

**Decision**: Add a new `mcp_requests` table to the existing MetricsStore SQLite database. Keep the existing `rag_events` table unchanged for backward compatibility.

**Rationale**: The new table captures different data (full response content, input params as JSON, separate input/output token counts). Existing `rag_events` serves benchmark analytics; mixing concerns would complicate both use cases.

**Alternatives considered**:

- Extend `rag_events` with nullable columns — rejected: different schema requirements, would bloat existing table
- Separate SQLite file — rejected: unnecessary complexity, MetricsStore already manages one DB file

## Decision 3: Response Content Storage

**Decision**: Store response content as-is up to 512KB per request. Truncate with a `[TRUNCATED]` marker beyond that. Store as TEXT in SQLite.

**Rationale**: Most MCP responses are well under 100KB (code chunks with metadata). 512KB provides ample headroom. SQLite handles TEXT blobs efficiently. The truncation limit is configurable via MetricsStore constructor.

**Alternatives considered**:

- Compress response content — rejected: adds complexity, SQLite handles text well
- Store in separate files — rejected: breaks atomicity, complicates cleanup
- No limit — rejected: unbounded storage risk with very large responses

## Decision 4: Non-Blocking Recording

**Decision**: Record synchronously after the response is sent (the MCP SDK handler returns the response, then we log). Use try/catch to ensure logging failures never propagate.

**Rationale**: SQLite writes are fast (<1ms for typical inserts). The existing pattern in `search_codebase.ts` already does synchronous logging after response assembly. Async would add unnecessary complexity for <1ms operations.

**Alternatives considered**:

- Async queue with background writer — rejected: over-engineered for <1ms SQLite inserts
- Fire-and-forget promise — rejected: potential unhandled rejections, no real benefit

## Decision 5: Dashboard API Design

**Decision**: Add a new `/api/requests` route with list (paginated, filterable) and detail (by ID) endpoints. Follows existing `metricsRouter` pattern.

**Rationale**: Consistent with existing dashboard API patterns. Separation from `/api/metrics` keeps concerns clean — metrics are aggregates, requests are individual event details.

**Alternatives considered**:

- Extend `/api/metrics/events` — rejected: different response shape (includes full response body), would break existing consumers
- GraphQL — rejected: overkill for a local dev tool, violates simplicity principle
