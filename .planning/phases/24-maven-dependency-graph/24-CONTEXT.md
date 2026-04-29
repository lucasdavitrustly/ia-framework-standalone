# Phase 24: Maven Multi-module Dependency Graph Traversal - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Parse `pom.xml` files to build a Maven module dependency graph. Store module relationships as Qdrant metadata alongside code chunks. Expose a new `get_module_dependencies` MCP tool that returns the dependency graph for a given module with key cross-boundary interfaces and DTOs.

Packages: packages/core, packages/mcp-server

</domain>

<decisions>
## Implementation Decisions

### Problem Statement (from benchmark run 2026-04-24)

Cross-module dependency queries (e.g. "how does core depend on processor?") returned generic answers because the indexer treats each Java file independently without tracking Maven POM relationships. The LLM had no way to reason about module boundaries from the retrieved context alone.

### Expected Impact

Direct improvement to cross-file/cross-module query category. Expected +4 points on deps-cross-file style prompts.

### Design Decisions

- **D-01:** POM parser is a new module in `packages/core`: `MavenModuleParser`. Reads `pom.xml` recursively from target project root using `glob` for discovery.
- **D-02:** Parsed data stored as a `ModuleGraph`: map of `moduleId → { dependencies: string[], interfaces: string[], dtos: string[] }`.
- **D-03:** `moduleId` = Maven `groupId:artifactId` (e.g. `com.payments:core`).
- **D-04:** Module graph persisted in SQLite (metrics store) alongside the existing metadata — not in Qdrant, since it's structural not semantic.
- **D-05:** Each Qdrant chunk's payload gains a `maven_module` field populated during indexing: `{ groupId, artifactId, version }`.
- **D-06:** New MCP tool `get_module_dependencies`: accepts `moduleName` (partial match on artifactId), returns direct deps, transitive deps (up to 2 hops), and the key interfaces/DTOs that cross the boundary.
- **D-07:** "Key interfaces" detection heuristic: Java types in `src/main/java` that appear in both the module's own code AND are referenced by a dependent module (detected via import analysis during AST chunking).

### Agent's Discretion

- XML parsing library (suggest `fast-xml-parser` — zero native deps, TypeScript types, already handles Maven POM structure)
- SQLite schema for `module_graph` table
- How to handle multi-level parent POMs (suggest: follow `<parent>` references up to 3 levels, cache parsed results)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing dependency graph infrastructure

- `packages/core/src/graph/dependency-graph.ts` — Existing file-level dependency graph (Phase 10); Maven module graph is a higher-level abstraction on top
- `packages/indexer/src/pipeline.ts` — IndexingPipeline where `maven_module` metadata should be injected per chunk

### MCP tool patterns

- `packages/mcp-server/src/tools/get-dependencies.ts` — Existing `get_dependencies` tool; new `get_module_dependencies` follows same pattern
- `packages/mcp-server/src/index.ts` — Tool registration

### Storage

- `packages/observability/src/metrics-store.ts` — SQLite store to extend with `module_graph` table
- `packages/vector-store/src/qdrant.ts` — Chunk upsert — add `maven_module` to payload

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `DependencyGraph`: Already models file→file edges; `ModuleGraph` can reuse the same graph abstraction at a coarser granularity
- `IndexingPipeline`: Already enriches chunk metadata — add `maven_module` enrichment step
- `MetricsStore` (SQLite): Add `module_graph` table with JSON column for adjacency list

### Integration Points

- `MavenModuleParser` → called during `ia-framework index` run before file walking begins
- `IndexingPipeline`: After detecting file belongs to a Maven module (by path prefix matching), annotate chunk payload
- `get_module_dependencies` MCP tool: Queries SQLite module graph, then fetches key interface chunks from Qdrant

</code_context>

<specifics>
## Specific Ideas

- Cache parsed POM data to `.ia-framework/maven-modules.json` so the module graph is available without re-parsing on every MCP query.
- The `get_module_dependencies` tool response should include Qdrant search results for the top-5 interface/DTO chunks that cross the boundary — gives the LLM concrete code examples alongside the structural graph.

</specifics>

<deferred>
## Deferred Ideas

- Gradle build file support (`build.gradle` / `build.gradle.kts`) — deferred to a future phase
- Visualizing the module graph in the dashboard — deferred to v1.4

</deferred>

---

_Phase: 24-maven-dependency-graph_
_Context gathered: 2026-04-24_
_Source: 2026-04-24 benchmark run findings_
