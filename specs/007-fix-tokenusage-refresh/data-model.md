# Data Model: Fix TokenUsage Page Stale Data

## Entities

No new entities are introduced. This feature modifies the behavior of the existing `MetricsStore` class and the `TokenUsage` React component.

## Schema Changes

### MetricsStore (packages/observability/src/metrics-store.ts)

**Change**: Add WAL pragma to the `initialize()` method.

```
Before: CREATE TABLE IF NOT EXISTS ... (no pragma)
After:  PRAGMA journal_mode = WAL; then CREATE TABLE IF NOT EXISTS ...
```

The WAL pragma is persistent — once set on a database file, it remains in WAL mode for all future connections until explicitly changed. This means existing database files will be migrated to WAL mode on first connection after this change.

## State Transitions

### TokenUsage Page Component State

```
LOADING → SUCCESS (initial fetch)
LOADING → ERROR (initial fetch failed)
SUCCESS → SUCCESS (polling refresh, silent update)
SUCCESS → SUCCESS (polling failure, keep last data)
```

No new states needed. The existing `loading`/`error`/`stats` state is sufficient — polling updates `stats` silently without transitioning through loading/error states.
