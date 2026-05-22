# Architecture: Multi-Repo Indexing Integration

**Domain:** Multi-repository RAG indexing for existing single-project framework
**Researched:** 2026-05-21
**Confidence:** HIGH (based on existing codebase analysis)

## Recommended Architecture

**Strategy: Repo-tagged payloads in shared collections, not separate collections per repo.**

Each Qdrant point gains a `repoId` payload field. The existing collection structure (AST, LLM) remains unchanged. Searches query across all repos by default, with optional repo filtering. The DependencyGraph already supports a `collection` parameter — repurpose this as the repo discriminator for cross-repo edge resolution.

### Component Boundaries

| Component                            | Change Type | Responsibility                                       |
| ------------------------------------ | ----------- | ---------------------------------------------------- |
| `packages/core` config schema        | **MODIFY**  | Accept array of repo definitions                     |
| `packages/core` types                | **MODIFY**  | Add `repoId` to ChunkMetadata, RetrievalResult       |
| `packages/retrieval` SearchEngine    | **MODIFY**  | Pass repo filter, tag results with repo origin       |
| `packages/retrieval` DependencyGraph | **MODIFY**  | Cross-repo neighbor expansion using collection field |
| `packages/mcp-server`                | **MODIFY**  | Expose repo filter param, include repo in output     |
| `packages/core` RepoRegistry         | **CREATE**  | Manages multi-repo config, per-repo detection        |
| Indexing pipeline                    | **MODIFY**  | Iterate repos, tag chunks with repoId                |

## Modification Details

### 1. Config Schema (`packages/core/src/config/schema.ts`)

Current: `targetProjectPath: z.string()` (single path)

**Change to:**

```typescript
export const RepoConfigSchema = z.object({
  id: z.string().min(1), // e.g. "core", "fi-connectors"
  path: z.string().min(1), // absolute path to repo root
  profile: ProjectProfileSchema.optional(), // per-repo detection
  indexing: IndexingConfigSchema.optional(), // per-repo overrides
});

export const ProjectConfigSchema = z.object({
  // Keep targetProjectPath for backward compat (single-repo mode)
  targetProjectPath: z.string().min(1).optional(),
  // New: array of repos
  repos: z.array(RepoConfigSchema).optional(),
  // Shared config
  embedding: EmbeddingProviderConfigSchema,
  vectorStore: VectorStoreConfigSchema,
  indexing: IndexingConfigSchema.optional(), // global defaults
  profile: ProjectProfileSchema.optional(),
  retrieval: RetrievalConfigSchema.optional(),
});
```

**Backward compatibility:** If `targetProjectPath` is set and `repos` is absent, treat as single-repo mode with auto-generated `repoId` from directory name.

### 2. ChunkMetadata & RetrievalResult (`packages/core/src/types/index.ts`, `packages/retrieval/src/types.ts`)

Add to both:

```typescript
/** Source repository identifier (matches repo.id from config) */
repoId?: string | undefined;
```

### 3. Qdrant Payload

Add `repoId: string` to every upserted point's payload. Existing points without `repoId` are treated as the "default" repo (backward compat). **Create a payload index** on `repoId` for efficient filtering.

### 4. SearchEngine (`packages/retrieval/src/search-engine.ts`)

- Add optional `repoId?: string | string[]` to `RetrievalQuery` for filtering
- When `repoId` is provided, inject Qdrant filter: `{ key: 'repoId', match: { value: repoId } }`
- Tag all `RetrievalResult` objects with their `repoId` from payload

### 5. DependencyGraph (`packages/retrieval/src/dependency-graph.ts`)

Already has `collection` parameter on all methods. **Reuse `collection` as `repoId`:**

- `upsertEdges(source, imports, projectRoot, collection=repoId)`
- `getNeighborFiles(startFiles, hops, collection=repoId)`

**Cross-repo expansion:** New method `getNeighborFilesAcrossRepos(startFiles, hops)` that queries ALL collections (no collection filter). This enables finding `InterfaceX` defined in `core` when starting from an implementation in `fi-connectors`.

```typescript
getNeighborFilesAcrossRepos(startFiles: string[], hops: 1 | 2): string[] {
  // Same BFS but WITHOUT collection filter in SQL WHERE clause
  // Enables cross-repo import resolution
}
```

### 6. MCP Server (`packages/mcp-server/src/server.ts`)

- Add optional `repo` parameter to `search_codebase` and `search_codebase_hybrid` tools
- Format results with `[repo:core]` prefix in output
- `get_file` tool: accept paths with repo prefix (`core:src/Foo.java`)
- `get_dependencies` tool: show cross-repo edges

### 7. New: RepoRegistry (`packages/core/src/config/repo-registry.ts`)

```typescript
export class RepoRegistry {
  constructor(private config: ProjectConfig) {}

  /** Get all configured repos (normalizes single-repo mode) */
  getRepos(): RepoDefinition[];

  /** Resolve a repoId to its absolute path */
  getRepoPath(repoId: string): string;

  /** Run profile detection for all repos */
  async detectProfiles(): Promise<Map<string, ProjectProfile>>;
}
```

## Data Flow

### Indexing (modified)

```
Config loaded → RepoRegistry.getRepos()
  → For each repo:
    → Scan files (repo.path + repo.indexing merged with global defaults)
    → Chunk (AST/LLM strategy)
    → Tag chunks: chunk.repoId = repo.id
    → Embed
    → Upsert to Qdrant (shared collection, repoId in payload)
    → DependencyGraph.upsertEdges(..., collection=repo.id)
```

### Search (modified)

```
Query arrives (optional repo filter)
  → Embed query
  → Qdrant search (with optional repoId filter in must clause)
  → Results tagged with repoId from payload
  → DependencyGraph expansion:
    - Default: getNeighborFilesAcrossRepos (cross-repo)
    - If repo filter: getNeighborFiles(collection=repoId)
  → Format with repo prefix in MCP output
```

### Cross-Repo Dependency Resolution

```
File in repo "fi-connectors" imports com.example.core.PaymentGateway
  → Java import resolver checks fileManifest across ALL repos
  → Finds match in repo "core" at /path/to/core/src/.../PaymentGateway.java
  → Edge stored: source_file=fi-connectors/Impl.java, target_file=core/PaymentGateway.java
  → collection="fi-connectors" (edge belongs to importer's repo)
  → Cross-repo expansion finds it regardless of collection filter
```

## Patterns to Follow

### Pattern 1: Config Normalization Layer

**What:** RepoRegistry normalizes both single-repo and multi-repo configs into a uniform `RepoDefinition[]`
**When:** Any code that needs to iterate repos
**Why:** Prevents if/else branching throughout codebase

### Pattern 2: Payload-Based Multi-Tenancy

**What:** Single Qdrant collection with `repoId` field + payload index
**When:** Multi-repo data storage
**Why:** Simpler than N collections. Qdrant payload indexes are O(1) for equality filters.

### Pattern 3: Merge-With-Override Config

**What:** Per-repo `indexing` config merges with global `indexing` defaults
**When:** Repo-specific include/exclude patterns
**Why:** DRY — don't repeat embedding config per repo

## Anti-Patterns to Avoid

### Anti-Pattern 1: Separate Qdrant Collections Per Repo

**What:** Creating `code-chunks-core`, `code-chunks-fi-connectors`, etc.
**Why bad:** Breaks unified search. RRF fusion across N repo collections creates N² search paths. Payload filtering is simpler and Qdrant handles it efficiently with indexed payloads.
**Instead:** Shared collections with `repoId` payload field + index.

### Anti-Pattern 2: Global File Paths Without Repo Context

**What:** Storing just `/abs/path/to/file.java` without knowing which repo it belongs to.
**Why bad:** Two repos may have `src/utils/Helper.java`. Without repoId disambiguation, DependencyGraph edges and file lookups become ambiguous.
**Instead:** Always store absolute paths AND repoId. Use repoId for display; absolute paths for graph resolution.

### Anti-Pattern 3: Breaking Single-Repo Mode

**What:** Removing `targetProjectPath` and requiring all users to migrate to `repos[]`.
**Why bad:** All existing installations have single `targetProjectPath` configs. Migration burden.
**Instead:** Keep `targetProjectPath` working. Normalize internally to `repos: [{ id: dirName, path: targetProjectPath }]`.

### Anti-Pattern 4: Eager Cross-Repo Expansion

**What:** Always expanding across all repos on every query.
**Why bad:** User asking about repo A doesn't want noise from repo B unless there's an actual import edge.
**Instead:** Cross-repo expansion only follows actual dependency graph edges, not blanket searches.

## Build Order (dependency-aware)

| Phase | What                                                                            | Depends On                       | Risk                                 |
| ----- | ------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------ |
| 1     | Config schema + types (add `RepoConfigSchema`, `repoId` fields)                 | Nothing                          | Low — additive, no behavior change   |
| 2     | RepoRegistry class (normalize single/multi)                                     | Phase 1                          | Low — pure logic                     |
| 3     | Indexing pipeline (iterate repos, tag chunks with repoId, create payload index) | Phases 1-2                       | Medium — data migration              |
| 4     | SearchEngine (accept repo filter, tag results)                                  | Phase 3 (needs indexed data)     | Low — additive filter                |
| 5     | DependencyGraph cross-repo expansion                                            | Phase 3 (needs multi-repo edges) | Medium — cross-repo resolution logic |
| 6     | MCP Server (repo param, formatted output)                                       | Phases 4-5                       | Low — API surface change             |
| 7     | Dashboard repo breakdown                                                        | Phase 3                          | Low — display only                   |

**Rationale:** Each step depends only on those above. Steps 1-2 are pure config/types with no behavior change. Step 3 changes data at rest. Steps 4-6 change data at query time.

## Scalability Considerations

| Concern                | 2 repos                            | 5 repos                          | 10+ repos                           |
| ---------------------- | ---------------------------------- | -------------------------------- | ----------------------------------- |
| Index time             | 2x (parallel possible via p-queue) | Parallel indexing essential      | Consider incremental-only           |
| Qdrant collection size | Fine                               | Fine (payload indexes handle it) | May need sharding strategy          |
| DependencyGraph SQLite | Fine                               | Fine                             | Consider repo-partitioned tables    |
| Config complexity      | Minimal                            | Per-repo override UX needed      | Config inheritance/template pattern |
| Cross-repo edges       | Manageable                         | File manifest grows              | Cache resolved manifests            |

## Key Integration Points Summary

| Existing Code                         | Integration Point                                          | Change Scope |
| ------------------------------------- | ---------------------------------------------------------- | ------------ |
| `ProjectConfigSchema`                 | Add `repos` array, make `targetProjectPath` optional       | Small        |
| `ChunkMetadata.id`                    | Include repoId in ID generation to prevent collisions      | Small        |
| `IndexingPipeline`                    | Loop over repos from RepoRegistry                          | Medium       |
| `VectorStore.upsert`                  | Include `repoId` in payload                                | Small        |
| `SearchEngine.search`                 | Inject repo filter into Qdrant query                       | Small        |
| `DependencyGraph.upsertEdgesWithJava` | Pass fileManifest from ALL repos for cross-repo resolution | Medium       |
| `DependencyGraph.getNeighborFiles`    | New cross-repo variant                                     | Medium       |
| MCP tool schemas (zod)                | Add optional `repo` string param                           | Small        |
| Result formatting                     | Prepend `[repo]` tag                                       | Small        |
| `bin.ts` (MCP server entry)           | Pass all repo paths for graph building                     | Small        |

## Sources

- Existing codebase: `packages/core/src/config/schema.ts` — config structure analysis
- Existing codebase: `packages/retrieval/src/dependency-graph.ts` — collection param already exists (line 131, 211)
- Existing codebase: `packages/retrieval/src/types.ts` — RetrievalResult/Query shape
- Existing codebase: `packages/mcp-server/src/server.ts` — tool registration pattern
- Qdrant documentation: payload indexing supports efficient filtering on string fields (HIGH confidence)
