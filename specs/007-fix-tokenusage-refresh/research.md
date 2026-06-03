# Research: Fix TokenUsage Page Stale Data

## R1: SQLite WAL Mode for Cross-Process Visibility

**Decision**: Enable WAL journal mode via `this.db.pragma('journal_mode = WAL')` in `MetricsStore.initialize()`.

**Rationale**: SQLite's default journal mode (`delete`) uses a rollback journal that can cause readers in one process to not see commits from another process's connection until the reader's next transaction begins. WAL mode allows concurrent readers and a single writer without blocking, and ensures readers always see the most recent committed state.

**Alternatives considered**:

- **Shared cache mode**: Only works within the same process (threads), not across processes. Not applicable.
- **Polling with `PRAGMA data_version`**: Could detect changes but adds complexity without solving the root cause. Rejected.
- **Using a single process (merge MCP server into dashboard API)**: Architecturally invasive, violates separation of concerns. Rejected.

**Evidence**: The project already uses WAL mode in `packages/core/src/graph/cross-repo-edges.ts:18` (`this.db.pragma('journal_mode = WAL')`), confirming it's an established pattern in this codebase.

## R2: Polling Strategy for TokenUsage Page

**Decision**: Use `setInterval` with a 30-second interval inside the existing `useEffect`, with cleanup on unmount. Guard against overlapping requests using a ref flag.

**Rationale**: Simple, no new dependencies. The page is a local dev tool (single user), so a 30s interval is sufficient and creates negligible load.

**Alternatives considered**:

- **WebSocket/SSE for real-time push**: Overkill for a single-user local tool. Requires server-side changes. Rejected.
- **React Query / SWR**: Would add a dependency for a single polling use case. Rejected per Principle V (Simplicity).
- **Visibility API (only poll when tab is visible)**: Nice optimization but not necessary for v1. Can add later.

## R3: Error Handling During Polling

**Decision**: On fetch failure during polling, keep displaying the last successful data. Do not show error toasts for transient failures. Only show the error state on initial load failure (existing behavior).

**Rationale**: Transient failures during polling are expected (e.g., dashboard API restarting). Flashing error states would be disruptive for a background refresh.
