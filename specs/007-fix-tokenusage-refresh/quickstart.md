# Quickstart: Fix TokenUsage Page Stale Data

## What This Feature Does

Fixes the TokenUsage dashboard page so it correctly displays new MCP metrics data by:

1. Enabling SQLite WAL mode in MetricsStore for cross-process read visibility
2. Adding auto-refresh polling to the TokenUsage page

## Files to Modify

| File                                          | Change                                                                |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `packages/observability/src/metrics-store.ts` | Add `this.db.pragma('journal_mode = WAL')` at start of `initialize()` |
| `apps/dashboard/src/pages/TokenUsage.tsx`     | Add 30s polling interval with cleanup                                 |

## Implementation Steps

1. **Add WAL mode** (packages/observability):
   - In `MetricsStore.initialize()`, add `this.db.pragma('journal_mode = WAL');` before the `CREATE TABLE` statements
   - Write a test that verifies `PRAGMA journal_mode` returns `wal` after initialization

2. **Add polling** (apps/dashboard):
   - In `TokenUsage.tsx`, refactor the `useEffect` to include a `setInterval` at 30s
   - Use a ref to prevent overlapping fetches
   - Clean up the interval on unmount
   - On polling failure, silently keep the last successful data

## Verification

```bash
# Run observability tests
pnpm --filter @ia-framework/observability test

# Run dashboard build
pnpm --filter @ia-framework/dashboard build

# Manual verification: start MCP server + dashboard, make tool calls, confirm data appears within 30s
```
