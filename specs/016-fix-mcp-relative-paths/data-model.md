# Data Model: Fix MCP Node 26+ Compatibility

## Entities

This feature does not introduce new persistent data entities. It modifies runtime state structures within the MCP server process.

### ServerCapabilities (runtime state)

Tracks which features are available and which backend is active after startup.

| Field | Type | Description |
|-------|------|-------------|
| sqliteBackend | 'node:sqlite' \| 'better-sqlite3' \| 'none' | Which SQLite backend was selected |
| dependencyGraphAvailable | boolean | Whether DependencyGraph initialized successfully |
| metricsStoreAvailable | boolean | Whether MetricsStore initialized successfully |
| runtimeVersion | string | Detected runtime version (e.g., "26.0.0") |
| degradedReasons | string[] | Human-readable reasons for any degraded features (empty when fully operational) |

### SqliteDatabase (adapter interface)

Backend-agnostic SQLite interface implemented by both `node:sqlite` and `better-sqlite3` wrappers.

| Method | Signature | Description |
|--------|-----------|-------------|
| exec | `(sql: string) => void` | Execute raw SQL statements |
| prepare | `(sql: string) => SqliteStatement` | Prepare a statement for repeated execution |
| pragma | `(directive: string) => void` | Set a pragma (node:sqlite: routes to `exec('PRAGMA ' + directive)`; better-sqlite3: native `.pragma()`) |
| transaction | `(fn: () => void) => (() => void)` | Wrap fn in a transaction (node:sqlite: manual BEGIN/COMMIT/ROLLBACK; better-sqlite3: native `.transaction()`) |
| close | `() => void` | Close the database connection |

### SqliteStatement (adapter interface)

| Method | Signature | Description |
|--------|-----------|-------------|
| run | `(...params) => void` | Execute with bound params, no result set |
| all | `(...params) => object[]` | Execute and return all rows |
| get | `(...params) => object \| undefined` | Execute and return first row |

### RepoAccessibility (runtime state)

Tracks per-repo filesystem access status after startup validation.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Repo logical name |
| path | string | Resolved absolute filesystem path |
| accessible | boolean | Whether the path was validated at startup |
| error | string? | Reason for inaccessibility (if any) |

### ToolResponseMetadata (response envelope)

Extended metadata included in `structuredContent` of tool responses.

| Field | Type | Description |
|-------|------|-------------|
| warnings | string[]? | Degradation warnings relevant to this response |
| degraded_features | string[]? | List of feature names that are unavailable |
| (existing fields) | various | `answered`, `fallbackUsed`, `cached`, etc. — preserved |

## State Transitions

### Server Startup States

```
INITIALIZING
  ├── [node:sqlite available (Node 22.5+)] → FULL (built-in backend)
  ├── [node:sqlite unavailable, better-sqlite3 works] → FULL (native backend)
  └── [both unavailable] → DEGRADED
        ├── [repos validated OK] → DEGRADED (search/retrieval works, no graph/metrics)
        └── [some repos invalid] → DEGRADED (partial repo access)
```

### Per-Request Path Resolution

```
TOOL_REQUEST
  ├── [repo accessible] → FILESYSTEM_READ → success
  ├── [repo accessible, file missing] → QDRANT_FALLBACK → stored content or empty
  └── [repo inaccessible] → ERROR_RESPONSE (with diagnostic)
```

## Relationships

- `ServerCapabilities` is a singleton created at startup, immutable after initialization
- `RepoAccessibility` entries are derived from `RepoRegistry` + startup validation
- `ToolResponseMetadata` is computed per-request based on `ServerCapabilities` and `RepoAccessibility`
