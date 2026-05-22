# Phase 45: Cross-Repo Dependency Graph — Research

**Date:** 2026-05-22
**Status:** Complete

## Summary

Cross-repo dependency graph requires three subsystems to be built/modified:

1. **SQLite graph store** — new `cross_repo_edges` table storing pre-computed edges
2. **Indexing second pass** — post-indexing phase that builds cross-repo edges by resolving imports against other repos' `provides` prefixes
3. **Expansion engine** — modify `expandHierarchy`, `multiHopExpand`, and `expandCallChain` to follow edges across repos

## Current Architecture

### Expansion Pipeline (search-codebase.ts)

```
query → search/searchWithExpansion → expandHierarchy → multiHopExpand → expandCallChain → tokenCap → results
```

All expansion functions use an `Engine` interface with scroll methods. They currently operate on a single Qdrant collection but already have `repoId` on results (from Phase 44).

### Key Types

- `RetrievalResult` (packages/retrieval/src/types.ts) — already has `repoId?: string` and `expansionSource?: string`
- `RepoEntry` (packages/core/src/types/index.ts) — has `provides?: string[]`
- `Engine` type (search-codebase.ts L14-48) — scroll methods accept name strings, return `RetrievalResult[]`

### Current Scroll Queries

All scroll methods (`scrollByName`, `scrollByDefines`, `scrollForHierarchy`, `scrollForImplementations`) search across ALL repos in Qdrant without repo filtering. This is fine for single-repo but needs repo-aware variant for cross-repo.

## Technical Approach

### 1. SQLite Graph Store Schema

```sql
CREATE TABLE cross_repo_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_repo TEXT NOT NULL,       -- repoId of importing file
  source_path TEXT NOT NULL,       -- relativePath in source repo
  source_symbol TEXT,              -- imported symbol name (nullable for whole-module)
  target_repo TEXT NOT NULL,       -- repoId of providing repo
  target_path TEXT,                -- resolved file path in target repo (null if unresolved)
  target_symbol TEXT,              -- exported symbol name
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_cross_repo_edges_source ON cross_repo_edges(source_repo, source_path);
CREATE INDEX idx_cross_repo_edges_target ON cross_repo_edges(target_repo, target_symbol);
```

### 2. Import Resolution Strategy (per D-01, D-02)

1. For each chunk's `imports[]`, check each import specifier against all repos' `provides[]` via prefix match
2. Once target repo identified, scroll for the imported symbol in target repo using `scrollByName` or `scrollByDefines` with a `repoId` filter
3. Store resolved edge in SQLite

### 3. Second Pass (per D-09)

After all repos are indexed:

1. Iterate all chunks in Qdrant (paginated scroll)
2. For each chunk with non-empty `imports[]`:
   - For each import, attempt prefix match against other repos' `provides[]`
   - If match found, resolve target file/symbol via Qdrant scroll with `repoId` filter
   - Insert edge into `cross_repo_edges`

### 4. Expansion Changes (per D-04, D-05, D-06)

Current expansion functions need a way to follow cross-repo edges:

- Add optional `crossRepoEdgeResolver` to Engine interface
- When expanding, check SQLite for cross-repo edges from the current result's repo+path
- Follow edge to target repo, scroll there for the symbol (costs 1 hop per D-04)
- Tag results with `expansionRepo: targetRepoId` (per D-11)

### 5. get_dependencies Changes (per D-07)

Show cross-repo imports with `[repo-name]` prefix in output, consistent with Phase 44's attribution format.

### 6. Re-index Behavior (per D-10)

When a repo is re-indexed: `DELETE FROM cross_repo_edges WHERE source_repo = ? OR target_repo = ?` then rebuild all edges involving that repo.

## Risk Assessment

- **Import resolution accuracy** — prefix matching is simple but won't handle re-exports or path aliases. Acceptable for v1.
- **Performance** — second pass iterates all chunks. Mitigated by batching and only processing chunks with external-looking imports.
- **Missing provides config** — repos without `provides` field simply won't have cross-repo edges resolved to them. Silent skip per Agent's Discretion.

## Validation Architecture

### Test Strategy

1. **Unit tests** for import-to-repo resolution (prefix matching logic)
2. **Unit tests** for edge storage/retrieval CRUD
3. **Integration test** for second-pass edge building with mock Qdrant
4. **Integration test** for expansion crossing repo boundary

### Key Assertions

- Import `@company/shared/utils` resolves to repo with `provides: ['@company/shared']`
- Expansion with `expand_hops=2` can cross 1 repo boundary + 1 internal hop
- `get_dependencies` output shows `[target-repo]` prefix for cross-repo imports
- Re-index drops and rebuilds edges correctly

## File Impact

| File                                                 | Change                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| `packages/core/src/graph/cross-repo-edges.ts`        | NEW — SQLite store for edges                                    |
| `packages/core/src/graph/import-resolver.ts`         | NEW — prefix matching + symbol lookup                           |
| `packages/mcp-server/src/tools/search-codebase.ts`   | MODIFY — cross-repo expansion in expandHierarchy/multiHopExpand |
| `packages/retrieval/src/types.ts`                    | MODIFY — add `expansionRepo?: string`                           |
| `packages/retrieval/src/multi-hop.ts`                | MODIFY — cross-repo awareness                                   |
| `packages/mcp-server/src/tools/get-dependencies.ts`  | MODIFY — annotate cross-repo imports                            |
| `packages/mcp-server/src/tools/result-formatting.ts` | MODIFY — `[via repo]` annotation                                |

## Sources

- Codebase: search-codebase.ts Engine interface, multi-hop.ts, types.ts, get-dependencies.ts
- Phase 44 summaries: repo attribution patterns established
- CONTEXT.md decisions D-01 through D-12
