# Technology Stack — Multi-Repo Indexing (v1.7)

**Project:** ia-framework
**Researched:** 2026-05-21
**Mode:** Incremental — additions to existing validated stack

## Executive Summary

Multi-repo indexing requires **zero new runtime dependencies**. The feature is primarily a schema extension + logic change to existing systems. The current stack (Qdrant payloads, better-sqlite3 dependency graph, Zod config schemas, tree-sitter parsing) already supports everything needed — it just needs to be parameterized by repo.

## New Stack Additions

### None Required

| Category         | Assessment | Rationale                                                                                                        |
| ---------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Vector DB        | No change  | Qdrant payloads already support arbitrary metadata — add `repo` field to existing payload schema                 |
| Dependency Graph | No change  | better-sqlite3 graph already stores edges with file paths — extend `resolveImport()` to check sibling repo paths |
| Config           | No change  | Zod schema extension — add `repos: RepoConfig[]` array to `ProjectConfigSchema`                                  |
| File discovery   | No change  | tinyglobby already handles absolute paths — run per-repo with different roots                                    |
| File watching    | No change  | chokidar already supports multiple paths in a single watcher                                                     |
| AST parsing      | No change  | tree-sitter is path-agnostic — just needs repo tag passed through pipeline                                       |
| MCP server       | No change  | Tool results already return metadata objects — add `repo` field                                                  |

## Schema Changes (Not Libraries)

### ProjectConfig Extension

```typescript
// New Zod schema addition to packages/core/src/config/schema.ts
const RepoConfigSchema = z.object({
  /** Unique identifier for this repo (e.g. "core", "connectors") */
  name: z.string(),
  /** Absolute or relative path to repo root */
  path: z.string(),
  /** Override language detection (optional) */
  language: z.enum(['typescript', 'java', 'python']).optional(),
  /** Package names this repo provides (for cross-repo import resolution) */
  provides: z.array(z.string()).optional(),
});

// Added to ProjectConfigSchema
repos: z.array(RepoConfigSchema).optional(),
```

### Qdrant Payload Extension

```typescript
// Existing payload gets one new field
interface ChunkPayload {
  // ... existing fields ...
  repo: string; // NEW: source repo identifier from config
}
```

### Dependency Graph Extension

```typescript
// The key logic change: resolveImport currently marks non-relative imports as "external"
// New behavior: check if specifier matches a `provides` entry in another repo's config
// If matched → resolve to that repo's source files
// Storage: edges table gets optional `source_repo` and `target_repo` columns
```

## Cross-Repo Dependency Resolution Strategy

**Current behavior:** `resolveImport()` in `dependency-graph.ts` line 25 marks anything not starting with `.` or `/` as `external: true` and stops.

**New behavior:**

1. Build a **package-to-repo map** from config: `{ "@paywithmybank/core": "payment-gateway-core", "fi-connectors": "fi-connectors" }`
2. When an import is non-relative, check if it matches a mapped package
3. If matched, resolve to that repo's entry point or source directory
4. Store the cross-repo edge in the graph with both repo identifiers

**For Java (Maven):** The existing `MavenDependencyGraph` already resolves `groupId:artifactId` → module path. Extend to resolve across repo boundaries using the same `provides` config.

**For TypeScript:** Map package.json `name` fields to repo paths. Resolve `@scope/package` imports to the providing repo's `src/` or declared `exports`.

## What NOT to Add

| Library                                             | Why Not                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| simple-git / isomorphic-git                         | Repos are local paths, not remote URLs. User manages git themselves.                                                                 |
| workspaces tooling (nx, lerna)                      | We're not managing a monorepo — we're indexing multiple independent repos.                                                           |
| GraphQL / API layer                                 | Overkill for config that's a JSON file read at startup.                                                                              |
| Redis / message queue                               | No async coordination needed — indexing is sequential per repo, parallel within.                                                     |
| Package resolution libs (resolve, enhanced-resolve) | Only need shallow mapping (package name → repo path), not full Node resolution algorithm. The `provides` config makes this explicit. |

## Integration Points

### Indexing Pipeline (`packages/indexer/src/pipeline.ts`)

- Accept `repo: string` parameter
- Pass through to chunk metadata
- Run once per configured repo (parallelizable with existing p-queue)

### Search Engine (`packages/retrieval/`)

- Qdrant filter: optionally scope by `repo` field in payload
- Default: search all repos (unified results)
- Results include `repo` field for display

### MCP Tools (`packages/mcp-server/`)

- `search_codebase` and `search_codebase_hybrid`: add optional `repo` filter parameter
- `get_file`: accept repo-qualified paths
- `get_dependencies`: expand across repo boundaries using new cross-repo edges

### Dashboard (`packages/dashboard-api/`)

- Config watcher: read `repos` array
- Status route: per-repo indexing stats
- No new API dependencies

## Confidence Assessment

| Decision                                  | Confidence | Rationale                                                                                                                                       |
| ----------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| No new runtime deps                       | HIGH       | Examined all existing capabilities — Qdrant metadata, SQLite graph, Zod schemas, chokidar multi-path — all support multi-repo without additions |
| `provides` config for package mapping     | HIGH       | Explicit > magical. User declares what each repo exports. Avoids brittle auto-detection of package.json across repos                            |
| Payload tagging over separate collections | HIGH       | Qdrant filtering is fast (indexed payload fields). Separate collections would break unified search and cross-repo graph expansion               |
| SQLite graph extension over separate DBs  | HIGH       | Cross-repo edges need to be in same graph for expansion queries. Single DB with repo columns is simpler                                         |

## Sources

- Existing codebase: `packages/retrieval/src/dependency-graph.ts` — current import resolution logic
- Existing codebase: `packages/core/src/config/schema.ts` — current ProjectConfigSchema
- Qdrant filtering docs: payload indexing supports string match filters (validated in v1.0)
- better-sqlite3: ALTER TABLE for column addition is supported (validated in v1.0)
