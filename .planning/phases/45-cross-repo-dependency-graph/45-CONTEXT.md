# Phase 45: Cross-Repo Dependency Graph - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Dependency graph expansion follows imports across repository boundaries. When a file in repo A imports a symbol from repo B, expansion includes the target file from repo B. `get_dependencies` shows cross-repo imports with repo attribution. Search result expansion (`expand_hops`) traverses into other repos when following dependency edges.

</domain>

<decisions>
## Implementation Decisions

### Import resolution strategy

- **D-01:** Prefix matching on `provides` field — match import specifier prefix against each repo's `provides` values (e.g. `import { Foo } from '@company/shared'` matches repo with `provides: ['@company/shared']`). External packages (lodash, react, etc.) that don't match any repo are skipped silently.
- **D-02:** Symbol-based lookup in target repo — once the target repo is identified, find the specific file by looking up the imported symbol name in the target repo's indexed chunks (matching against exports).
- **D-03:** Resolution happens at index time — cross-repo edges are pre-computed during indexing, not resolved lazily at query time.

### Expansion boundary rules

- **D-04:** Cross-repo costs 1 hop — crossing a repo boundary consumes 1 hop from the `expand_hops` budget. With `expand_hops=2`, can cross into repo B (1 hop) then expand 1 more within repo B.
- **D-05:** All expansion types cross repos — hierarchy (superclass chains), call-chain, multi-hop symbol lookup, and import-based expansion all traverse repo boundaries uniformly.
- **D-06:** No special repo limit — no cap on distinct repos per expansion chain beyond the existing `expand_hops=2` maximum.
- **D-07:** `get_dependencies` shows cross-repo imports with `[repo-name]` prefix, consistent with Phase 44 D-01 attribution format.

### Graph storage for cross-repo edges

- **D-08:** SQLite graph table with `source_repo` and `target_repo` columns — aligns with existing architecture decision in STATE.md.
- **D-09:** Second pass after all repos indexed — cross-repo edges are built in a separate pass after individual repo indexing completes, ensuring target symbols exist before edge creation.
- **D-10:** Full rebuild of affected edges on re-index — when a repo is re-indexed, drop and rebuild all cross-repo edges involving that repo. No incremental diffing.

### Attribution in expanded results

- **D-11:** Add `expansionRepo` field to expanded results that crossed a repo boundary. Combined with existing `expansionSource` field for full provenance.
- **D-12:** Annotate cross-repo expansions in text output — show `[via repo-name]` or similar on results that came from another repo via expansion.

### Agent's Discretion

- Exact SQLite schema column types and index strategy
- Format of the `[via repo-name]` annotation in text output
- Whether to batch symbol lookups during the second-pass edge building
- Error handling for repos with missing/stale `provides` field

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Expansion engine

- `packages/mcp-server/src/tools/search-codebase.ts` — `Engine` interface, `expandHierarchy()`, `multiHopExpand()`, `searchWithExpansion` calls. All expansion logic lives here.
- `packages/mcp-server/src/tools/search-codebase-hybrid.ts` — Hybrid search expansion path, uses same `searchWithExpansion`

### Dependency tool

- `packages/mcp-server/src/tools/get-dependencies.ts` — `getDependenciesHandler()`, extracts imports/exports from chunks. Needs cross-repo annotation.

### Repo registry

- `packages/core/src/repo-registry.ts` — `RepoRegistry` class, resolves repo names/paths, has `provides` field access
- `packages/core/src/types/index.ts` — `provides` field definition on repo config type

### Result formatting

- `packages/mcp-server/src/tools/result-formatting.ts` — `buildCodeAnchor()`, `formatRetrievalContext()` — needs `[via repo]` annotation support

### Requirements

- `.planning/REQUIREMENTS.md` §SRCH-02 — "Dependency graph expansion crosses repo boundaries"

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `Engine` interface with `scrollByName`, `scrollByDefines`, `scrollForHierarchy`, `scrollForImplementations` — all can be extended to accept optional repo filter
- `expandHierarchy()` and `multiHopExpand()` — existing multi-hop logic to extend with cross-repo awareness
- `RepoRegistry` — already resolves repo names to paths and holds `provides` array
- `expandCallChain` — existing call-chain expansion, needs repo-boundary awareness

### Established Patterns

- All expansion functions take `Engine` interface and return `RetrievalResult[]` — new cross-repo logic should follow same pattern
- Qdrant scroll queries with payload filters (used by `scrollForHierarchy`) — same approach for cross-repo symbol lookup with `repoId` filter
- `expansionSource` field on results — existing provenance tagging pattern to extend with `expansionRepo`

### Integration Points

- SQLite graph store (currently used by benchmark-store) — needs new table/columns for dependency edges with `source_repo`/`target_repo`
- Indexing pipeline — needs a "second pass" hook after all repos indexed to build cross-repo edges
- `RetrievalResult` type — needs `expansionRepo?: string` field added

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 45-cross-repo-dependency-graph_
_Context gathered: 2026-05-22_
