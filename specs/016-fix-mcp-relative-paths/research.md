# Research: Fix MCP Node 26+ Compatibility

## Research Findings

### R1: Why better-sqlite3 Fails on Node 26 — and the Full-Functionality Fix

**Decision**: Introduce a SQLite adapter that uses the runtime's built-in `node:sqlite` module (`DatabaseSync`) as the primary backend on Node 22.5+, with `better-sqlite3` as a fallback for older versions. This delivers **full functionality** on Node 26+, not just graceful degradation.

**Rationale**: `better-sqlite3@12.8.0` declares `engines: {node: 20.x || 22.x || 23.x || 24.x || 25.x}`. On Node 26, pre-built binaries don't exist and N-API compatibility may break. The static `import Database from 'better-sqlite3'` loads the native addon at module import time, crashing the whole module. Node's built-in `node:sqlite` module (stable since 22.5) provides an equivalent synchronous API with no native compilation, working on all current and future Node versions.

**API compatibility** (both provide synchronous SQLite):

| Operation | better-sqlite3 | node:sqlite |
|-----------|----------------|-------------|
| Open DB | `new Database(path)` | `new DatabaseSync(path)` |
| Raw SQL | `db.exec(sql)` | `db.exec(sql)` |
| Prepare | `db.prepare(sql)` | `db.prepare(sql)` |
| Run | `stmt.run(...params)` | `stmt.run(...params)` |
| Query all | `stmt.all(...params)` | `stmt.all(...params)` |
| Query one | `stmt.get(...params)` | `stmt.get(...params)` |

The APIs are nearly identical for basic CRUD, but there are **three real differences** the adapter must abstract (confirmed by auditing current usage):

| Feature | better-sqlite3 | node:sqlite | Adapter strategy |
|---------|----------------|-------------|------------------|
| Pragmas | `db.pragma('journal_mode = DELETE')` | No `.pragma()` — use `db.exec('PRAGMA journal_mode = DELETE')` | Adapter exposes `pragma(str)` that routes to `exec('PRAGMA ' + str)` for node:sqlite |
| Transactions | `db.transaction(fn)` returns a callable | No `.transaction()` — manual `BEGIN`/`COMMIT`/`ROLLBACK` | Adapter exposes `transaction(fn)` that wraps fn in BEGIN/COMMIT with ROLLBACK on error for node:sqlite; delegates to native for better-sqlite3 |
| Named params | `stmt.run({ key: val })` | Supported with `allowBareNamedParameters` (default true) | Both accept object binding; verify param prefix handling in adapter tests |

**Confirmed current usage requiring abstraction**:
- `metrics-store.ts:36-37` — `db.pragma('journal_mode = DELETE')`, `db.pragma('busy_timeout = 5000')`
- `dependency-graph.ts:143,179` — `db.transaction(insertMany)` for batch edge inserts
- `metrics-store.ts:86,227` — `stmt.run({ ...namedParams })` object binding

**Alternatives considered**:
- Graceful degradation only (disable features on Node 26) → **rejected** — user requires full functionality
- Upgrade `better-sqlite3` to a version supporting Node 26 → not yet available upstream
- Replace with `sql.js` (pure JS SQLite via WASM) → performance regression, heavier bundle, async API mismatch
- Use `node:sqlite` primary + `better-sqlite3` fallback via adapter → **chosen** — full functionality, zero native dependency on modern runtimes

### R1b: node:sqlite Availability and Stability

**Decision**: Use `node:sqlite` on Node 22.5+. On Node 22.0-22.4, fall back to `better-sqlite3`.

**Rationale**: `node:sqlite` was introduced in Node 22.5.0. It may emit an `ExperimentalWarning` on some versions but is functionally stable for basic CRUD operations (which is all this project needs — small local databases for graph edges and metrics). Since the project's minimum is Node 22.0.0, the adapter must handle the 22.0-22.4 gap where `node:sqlite` doesn't exist by falling back to the native addon.

**Implementation note**: Suppress the experimental warning at process startup if needed, or accept it (it goes to stderr → log file, not the MCP stdio channel).

### R2: MetricsStore vs DependencyGraph — Route Both Through the Adapter

**Decision**: Both `DependencyGraph` (`packages/retrieval/src/dependency-graph.ts`) and `MetricsStore` (`packages/observability/src/metrics-store.ts`) currently use a static `import Database from 'better-sqlite3'`. Both will be refactored to consume the SQLite adapter instead.

**Rationale**: Routing both through the adapter means both get full functionality on Node 26+ via `node:sqlite`. This also removes the asymmetry where `DependencyGraph` had try/catch degradation but `MetricsStore` did not — with the adapter, neither needs special-case crash handling because the backend always resolves to a working implementation on supported runtimes.

**Implementation approach**:
1. Change both constructors to accept a `SqliteDatabase` (adapter interface) OR call the adapter factory internally with the db path
2. The factory selects `node:sqlite` or `better-sqlite3` transparently
3. Keep a final try/catch in `bin.ts` only for the extreme edge case where BOTH backends are unavailable

### R3: Path Resolution Chain Analysis

**Decision**: The path resolution works correctly IF `IA_FRAMEWORK_CONFIG` environment variable is set to an absolute path. The vulnerability is the fallback: `join(process.cwd(), '.ia-framework', 'project.json')`.

**Rationale**: The `configure-mcp.sh` script and `mcp.json` template already set `IA_FRAMEWORK_CONFIG` to an absolute path. The issue occurs when:
- The env var is not set (manual MCP host configuration)
- The env var is lost in subprocess chaining
- The user configures their IDE's MCP settings without the env var

**Implementation approach**:
1. Add a secondary discovery mechanism: resolve config relative to the server binary's own location (`import.meta.url` → dirname → walk up to find `.ia-framework/project.json`)
2. Add startup validation: verify all resolved repo paths exist on disk
3. Log the resolution method used for debugging

### R4: Tool Response Metadata Pattern

**Decision**: Use the existing `structuredContent` field to surface `warnings` array when features are degraded.

**Rationale**: `structuredContent` is already used extensively in both `get-file.ts` and `search-codebase.ts` for metadata (e.g., `fallbackUsed`, `cached`, `confidence_gated`). The MCP SDK's `CallToolResult` type has `structuredContent?: {[key: string]: unknown}` — fully extensible.

**Implementation approach**:
- Add `warnings?: string[]` and `degraded_features?: string[]` to `structuredContent` in responses
- Populate when features are unavailable (e.g., `["dependency_graph_expansion_disabled: better-sqlite3 not available on Node 26"]`)
- This is surfaced in the text response header as well for visibility

### R5: Config Discovery Fallback using import.meta.url

**Decision**: Use the MCP server binary's own filesystem location as a secondary anchor for config discovery when `IA_FRAMEWORK_CONFIG` is not set.

**Rationale**: The server binary lives at a known location relative to the project root (`packages/mcp-server/dist/bin.js` or via the resolved symlink). Using `import.meta.url` gives an absolute path to the running script regardless of `process.cwd()`. From there, walking up to find `.ia-framework/project.json` provides a CWD-independent discovery.

**Alternatives considered**:
- Require `IA_FRAMEWORK_CONFIG` (hard error if not set) → breaks backward compat
- Use `__dirname` → not available in ESM
- Use only `process.cwd()` → the current broken approach
- Use `import.meta.url` + walk-up discovery → **chosen** — backward compatible, CWD-independent

### R6: Startup Validation Strategy

**Decision**: After resolving all repo paths, validate that each exists as an accessible directory. Log warnings for failures but don't abort startup.

**Rationale**: Partial functionality is better than no functionality. If 3 of 4 repos are accessible, serve those 3. Mark the invalid one as unavailable and surface in tool responses.

**Implementation**: Call `stat()` on each resolved path at startup. Store accessibility status in a `Map<repoName, { path: string, accessible: boolean, error?: string }>`.
