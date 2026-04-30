# Phase 27: Cross-File Relationship Graph Indexing - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the indexer in `packages/core` to build and persist a cross-file import/export relationship graph. During indexing, for each file, extract all import statements and map them to their resolved file targets. Store these edges in SQLite (or as Qdrant payload metadata) so that downstream retrieval can traverse relationships between files — e.g., "this DTO class is imported by these service files which also import this encryption utility."

Packages in scope: `packages/core` (indexer, graph storage), `packages/mcp-server` (new `get_file` MCP tool and expand_hops retrieval support).

The existing Maven dependency graph (phase 24) provides a module-level precedent; this phase extends to file-level import/export edges across all supported languages (Java, TypeScript).

</domain>

<decisions>
## Implementation Decisions

### Problem Statement (from benchmark run 2026-04-24 → 2026-04-28)

Two prompts regressed on the v1.3 benchmark:

1. **arch-semantic** — "How does the service layer communicate with the domain model?" — the model missed decorator chains (e.g., `@Service` → `@Repository` flow) and DTO transformation layers because the indexer never recorded that `OrderService.java` imports `OrderDTO.java` which imports `FieldEncryption.java`.
2. **deps-cross-file** — "What external dependencies does the payment module depend on?" — the model retrieved only the direct callee but not the transitive chain of adapters and utilities that are imported across 3-4 hops.

Root cause: the indexer stores individual file chunks in isolation. No graph edges connect files by import/export relationship. When the model asks a cross-cutting architecture question, it retrieves top-k semantic matches but never discovers the structurally connected files.

### Graph Storage

- **D-01:** Store import edges in the existing metrics SQLite database (`packages/core/src/db/`) as a new `file_edges` table: `(source_file, target_file, edge_type, collection)`. `edge_type` is one of `import`, `export`, `re-export`.
- **D-02:** For Java: parse `import com.example.Foo;` statements using tree-sitter (already in use). Resolve to file paths within the indexed collection using the existing file manifest.
- **D-03:** For TypeScript: parse `import { Foo } from './foo'` and `export { Bar } from './bar'` using the existing tree-sitter TypeScript grammar. Resolve relative paths to absolute paths within the collection.
- **D-04:** Unresolved imports (external libraries like `java.util.*` or `node:fs`) are recorded with `target_file = null` and `edge_type = 'external'` for future use.
- **D-05:** Graph is rebuilt incrementally: when a file is re-indexed, its outgoing edges are deleted and re-inserted.

### MCP Tool: `get_file`

- **D-06:** Add a new MCP tool `get_file(path, collection)` that returns all indexed chunks for a specific file by relative path. Used by the agent when it has a file path from search results and wants full context.
- **D-07:** Add `expand_hops` parameter (0, 1, 2) to `search_codebase` and `search_codebase_hybrid` tools. When `expand_hops > 0`, after the initial top-k retrieval, traverse the graph for each result file up to `expand_hops` levels and include chunks from connected files. Default: 2 (transitive imports — catches chains like Service→DTO→Encryption that caused the arch-semantic regression).

### Language Support

- **D-08:** Java and TypeScript in v1.4. Python imports deferred to v1.5 (low benchmark signal in current corpus).
- **D-09:** Only same-collection edges are traversed during retrieval expansion. Cross-collection graph traversal deferred.

### Agent's Discretion

- SQLite schema details beyond the `file_edges` spec above
- Exact tree-sitter query patterns for import extraction (language-specific)
- Whether graph edges are also stored as Qdrant payload (denormalized) vs SQLite only
- Batch size and concurrency for graph building pass

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Indexer (primary target)

- `packages/core/src/indexer/` — Indexing pipeline. `IndexingPipeline` class drives chunking + embedding + Qdrant upsert. The graph-building pass should run after chunking, using the same tree-sitter parse results to avoid double-parsing.

### Maven graph precedent

- `packages/core/src/maven/` — Maven POM parser and `ModuleGraph` with BFS traversal and SQLite persistence. Follow the same pattern for `FileGraph`.
- `packages/mcp-server/src/tools/get_module_dependencies.ts` — MCP tool wrapping the Maven graph. `get_file` and `expand_hops` follow the same tool registration pattern.

### Tree-sitter integration

- `packages/core/src/chunker/ast-chunking-strategy.ts` — Existing AST chunker using web-tree-sitter. Import extraction should reuse the same Parser/Language instances rather than initializing new ones.

### MCP server tools

- `packages/mcp-server/src/tools/` — All existing MCP tool registrations. New `get_file` tool and `expand_hops` extension go here.

### Search engine

- `packages/mcp-server/src/search/search-engine.ts` — `SearchEngine` class with `searchWithFallback()`. The `expand_hops` expansion logic plugs in here as a post-retrieval enrichment step.

### Benchmark corpus (regression prompts)

- `.ia-framework/benchmark-queries.json` — Entries `arch-semantic` and `deps-cross-file` are the primary regression tests for this phase. Validation passes when these two queries produce results that reference connected files beyond the direct semantic match.

</canonical_refs>

<code_context>

## Existing Code Insights

### Indexer pipeline

`IndexingPipeline` in `packages/core` drives file scanning → chunking (AST or LLM strategy) → embedding → Qdrant upsert. The pipeline has per-file progress reporting. The graph-building pass should run as a second pass after chunking so that all file paths in the collection are known before edges are resolved.

### Maven graph as template

Phase 24 implemented `MavenModuleGraph` with:

- A SQLite table (`maven_modules`, `maven_dependencies`) via `better-sqlite3`
- BFS traversal returning typed `ModuleGraph`
- An MCP tool `get_module_dependencies` with `depth` parameter

The file-level graph follows the same pattern: `FileGraph` with `file_edges` table, BFS/DFS up to `expand_hops` depth, exposed via `get_file` (single-file) and `expand_hops` on search tools.

### Tree-sitter already initialized per file

`AstChunkingStrategy.chunk(file)` initializes a tree-sitter parser and walks the AST to extract function/class nodes. Import statements are top-level nodes in both Java and TypeScript grammars — the same AST walk can extract imports without a second parse.

### Qdrant payload already includes `filePath`

Every chunk's Qdrant payload includes `filePath` (relative path) and `collection`. The graph traversal can use `filePath` values from search results to look up edges in the `file_edges` SQLite table.

### Current expand_hops gap

`search_codebase` currently returns the top-k chunks and nothing else. Adding `expand_hops` is a backwards-compatible extension: when `expand_hops = 0` (or omitted), behavior is identical to today. When `expand_hops = 1`, the tool fetches import neighbors and appends them to the result.

</code_context>

<specifics>
## Specific Ideas

- The `file_edges` table should be indexed on `(collection, source_file)` for fast outgoing-edge lookup during expand_hops traversal.
- For TypeScript barrel files (`index.ts` re-exporting from multiple files), all re-exported targets should be added as `re-export` edges — these are exactly the files that get missed today on architecture queries.
- Consider emitting a "graph density" stat at end of indexing: `N files, M import edges, K unresolved external`.
- For the `get_file` MCP tool, return chunks sorted by `startLine` ascending so the model sees the file in reading order.

</specifics>

<deferred>
## Deferred Ideas

- Python import extraction — low signal in current benchmark corpus, add in v1.5
- Cross-collection graph traversal — complex, deferred
- Symbol-level edges (which specific exported symbol is imported) — column-level granularity not needed for v1.4
- Visualization of the file graph in the dashboard — nice-to-have, deferred
- Incremental graph updates on file-watcher events (chokidar) — deferred; full rebuild on re-index is acceptable for v1.4

</deferred>

---

_Phase: 27-cross-file-relationship-graph_
_Context gathered: 2026-04-29_
_Source: Milestone planning — RAG Retrieval Quality Improvements v1.4_
