# Quickstart: MCP Usage Dashboard

## What This Feature Does

Tracks every MCP tool call (from any client — OpenCode, Cursor, benchmark runner, etc.) and records the full request/response with token usage. Exposes this data through the dashboard API for browsing and analysis.

## Key Changes

1. **packages/observability** — New `mcp_requests` table in MetricsStore with methods to log and query requests
2. **packages/mcp-server** — Request logger that wraps all tool handlers to capture input/output/timing
3. **packages/dashboard-api** — New `/api/requests` routes for listing, filtering, and viewing request details

## Development Flow

```bash
# Run tests for affected packages
pnpm --filter @ia-framework/observability test
pnpm --filter @ia-framework/mcp-server test
pnpm --filter @ia-framework/dashboard-api test

# Build all
pnpm build

# Start MCP server (will now log all requests)
# Then make tool calls from OpenCode/IDE — they appear in dashboard
pnpm --filter @ia-framework/dashboard-api dev
# Visit: GET http://localhost:3100/api/requests
```

## Implementation Order

1. Extend MetricsStore with `mcp_requests` table and CRUD methods (TDD)
2. Create request-logger wrapper in mcp-server (TDD)
3. Wire request-logger into `createMcpServer()`
4. Add dashboard API routes (TDD)
5. Integration test: full flow from tool call to API response
