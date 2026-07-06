# Implementation Plan: Fix MCP Node 26+ Compatibility

## Technical Context

| Aspect | Detail |
|--------|--------|
| Feature | Fix MCP startup crash on Node 26+ and CWD-dependent path resolution |
| Packages affected | `packages/mcp-server`, `packages/observability`, `packages/retrieval`, `packages/core` |
| Primary entry point | `packages/mcp-server/src/bin.ts` |
| Key files | `bin.ts`, `server.ts`, `tools/get-file.ts`, `tools/search-codebase.ts` |
| Native dep | `better-sqlite3@12.8.0` (engines: node 20-25 only) |
| Built-in alternative | `node:sqlite` (`DatabaseSync`) — available since Node 22.5 |
| Module format | ESM (`"type": "module"`, tsup → ESM-only output) |
| Build tool | tsup (esbuild-based), target: node22 |
| MCP SDK | `@modelcontextprotocol/sdk@1.29.0` |

## Design Decisions

1. **SQLite adapter abstraction** — a thin interface that both `node:sqlite` (DatabaseSync) and `better-sqlite3` (Database) implement, allowing transparent backend selection
2. **`node:sqlite` as primary backend** on Node 22.5+ — eliminates native addon dependency entirely for modern runtimes
3. **`better-sqlite3` as fallback** for Node 22.0-22.4 (if still needed to maintain backward compat)
4. **Config discovery via `import.meta.url`** as secondary fallback when `IA_FRAMEWORK_CONFIG` is unset and `process.cwd()` is wrong
5. **Per-response `warnings`/`degraded_features`** in `structuredContent` — leverages existing metadata pattern
6. **Startup path validation** with `stat()` — marks repos as accessible/inaccessible without blocking startup

## Implementation Phases

### Phase A: SQLite Adapter Layer

**Goal**: Create an abstraction over SQLite backends so the rest of the codebase is backend-agnostic. Full functionality on Node 26+.

**Changes**:

1. **`packages/core/src/sqlite/adapter.ts`** (new):
   - Define `SqliteDatabase` interface with methods: `exec(sql)`, `prepare(sql)` → `Statement`
   - Define `SqliteStatement` interface with methods: `run(...params)`, `all(...params)`, `get(...params)`
   - Implement `createDatabase(path: string): SqliteDatabase` factory function
   - Factory tries `node:sqlite` (`DatabaseSync`) first via dynamic `import('node:sqlite')`
   - Falls back to `better-sqlite3` via dynamic `import('better-sqlite3')`
   - If both fail, throws descriptive error with guidance

2. **`packages/retrieval/src/dependency-graph.ts`**:
   - Replace `import Database from 'better-sqlite3'` with adapter usage
   - Accept `SqliteDatabase` instance via constructor injection or use factory

3. **`packages/observability/src/metrics-store.ts`**:
   - Replace `import Database from 'better-sqlite3'` with adapter usage
   - Accept `SqliteDatabase` instance via constructor injection or use factory

4. **`packages/mcp-server/src/bin.ts`**:
   - Use the adapter factory to create database instances
   - Wrap in try/catch for the edge case where both backends fail
   - Track capabilities state

**Files to create/modify**:
- `packages/core/src/sqlite/adapter.ts` (new — adapter interface + factory)
- `packages/core/src/sqlite/index.ts` (new — barrel export)
- `packages/retrieval/src/dependency-graph.ts` (modify constructor to use adapter)
- `packages/observability/src/metrics-store.ts` (modify constructor to use adapter)
- `packages/mcp-server/src/bin.ts` (use adapter, add try/catch)

### Phase B: CWD-Independent Path Resolution

**Goal**: File reads succeed regardless of process.cwd()

**Changes**:

1. **`packages/mcp-server/src/bin.ts`**:
   - Add `import.meta.url`-based config discovery as fallback
   - Resolution order: `IA_FRAMEWORK_CONFIG` env → `import.meta.url` walk-up → `process.cwd()` (last resort)
   - Log which discovery method was used

2. **`packages/mcp-server/src/server.ts`**:
   - After constructing `repoPathMap`, validate each path exists with `stat()`
   - Store accessibility map alongside path map
   - In `readFileFn` closures, check accessibility before attempting read
   - On inaccessible repo, throw descriptive error (not a generic ENOENT)

3. **`packages/core/src/config/registry.ts`** (optional enhancement):
   - Add a `validate()` method to `RepoRegistry` that checks paths exist
   - Return `{ valid: RepoEntry[], invalid: { entry: RepoEntry, reason: string }[] }`

**Files to modify**:
- `packages/mcp-server/src/bin.ts` (lines 35-36 configPath determination)
- `packages/mcp-server/src/server.ts` (lines 70-77 repoPathMap construction, add validation)
- `packages/core/src/config/registry.ts` (optional: add validation method)

### Phase C: Diagnostic Messaging

**Goal**: Clear, actionable messages for backend selection and path issues

**Changes**:

1. **Startup logging**:
   - Log runtime version detected
   - Log SQLite backend selected (built-in vs native addon)
   - Log each repo path validation result
   - Log overall server mode (FULL / DEGRADED)

2. **Per-response metadata**:
   - Create shared utility for injecting degradation metadata into responses
   - Apply to all tool handlers consistently
   - Only populated when something is actually degraded (not on normal full-functionality operation)

**Files to modify/create**:
- `packages/mcp-server/src/capabilities.ts` (new — ServerCapabilities type + injection utility)
- `packages/mcp-server/src/tools/get-file.ts` (use shared utility)
- `packages/mcp-server/src/tools/search-codebase.ts` (use shared utility)

## Verification Strategy

1. **Unit tests**: Test SQLite adapter with `node:sqlite` backend — create DB, write, read, verify
2. **Unit tests**: Test SQLite adapter fallback to `better-sqlite3` when `node:sqlite` is unavailable
3. **Unit tests**: Mock both backends unavailable → verify server starts with features disabled
4. **Unit tests**: Set `IA_FRAMEWORK_CONFIG` to absolute path with CWD set elsewhere → verify file reads succeed
5. **Unit tests**: Verify `structuredContent.warnings` populated when features degraded
6. **Integration test**: Run MCP server on Node 22.5+ with `better-sqlite3` removed → verify full functionality via `node:sqlite`
7. **Integration test**: Run MCP server with CWD=/tmp → verify tools respond correctly

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `node:sqlite` API differences from better-sqlite3 | Medium | Medium | Adapter layer abstracts differences; test both backends |
| `node:sqlite` performance characteristics differ | Low | Low | Benchmark; our usage is simple (small DBs, few queries) |
| `node:sqlite` still experimental flag on Node 22 | Low | Low | Has been stable since 22.5; we only use basic CRUD operations |
| Dynamic import changes startup timing | Low | Low | Benchmark startup latency before/after |
| `import.meta.url` not available in certain build configs | Low | Medium | tsup preserves import.meta; test in CI |

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/core/src/sqlite/adapter.ts` | New | SQLite adapter interface + backend factory |
| `packages/core/src/sqlite/index.ts` | New | Barrel export |
| `packages/retrieval/src/dependency-graph.ts` | Modify | Use adapter instead of direct better-sqlite3 |
| `packages/observability/src/metrics-store.ts` | Modify | Use adapter instead of direct better-sqlite3 |
| `packages/mcp-server/src/bin.ts` | Modify | Adapter usage, config discovery, capabilities |
| `packages/mcp-server/src/server.ts` | Modify | Path validation, capabilities passthrough |
| `packages/mcp-server/src/capabilities.ts` | New | ServerCapabilities type + utility |
| `packages/mcp-server/src/tools/get-file.ts` | Modify | Add warnings to response metadata |
| `packages/mcp-server/src/tools/search-codebase.ts` | Modify | Add warnings to response metadata |
| `packages/core/src/config/registry.ts` | Modify (optional) | Add path validation method |
