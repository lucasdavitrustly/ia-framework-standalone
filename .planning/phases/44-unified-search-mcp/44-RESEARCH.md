# Phase 44: Unified Search & MCP - Research

**Researched:** 2026-05-22
**Domain:** MCP tool modifications for multi-repo search and file resolution
**Confidence:** HIGH

## Summary

This phase modifies the existing MCP search tools to return results from all indexed repos with clear source attribution. The infrastructure is already in place: `ChunkPayload.repoId` is stored in Qdrant (Phase 43), `RepoRegistry` resolves repo names to paths, and the search/hybrid engines already support `filter` parameters. The work is primarily wiring: adding a `repo` param to tool schemas, passing Qdrant payload filters, adding `repoId` to `RetrievalResult`, modifying `result-formatting.ts` for `[repo]` prefix display, and updating `get_file`/`get_dependencies` for multi-repo path resolution.

The `MultiCollectionSearchEngine` already merges results from multiple engines (ast/llm collections) — this phase operates at a different level: filtering within a single collection by `repoId` payload field, and adding repo attribution to output formatting.

**Primary recommendation:** Add `repoId` field to `RetrievalResult`, thread it through from `ChunkPayload`, modify `buildCodeAnchor()` and `formatResult()` for display, add optional `repo` param to search tool schemas with Qdrant filter passthrough, and extend `get_file`/`get_dependencies` to iterate all repos or parse `repo:path` syntax.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- D-01: Both JSON `repo` field in response objects AND `[repo-name]` prefix in display anchor string
- D-02: `[repo-name]` prefix always shown, even in single-repo projects
- D-03: Results grouped by repo, not interleaved. Each repo forms a cluster in output
- D-04: Repo groups ordered by best-match — repo with highest-scoring single result appears first
- D-05: Natural distribution when `limit` is set — proportional representation based on hit count
- D-06: Auto-resolve paths across all repos for get_file/get_dependencies. Return all matches with repo attribution
- D-07: Support optional `repo:path/to/file.ts` prefix syntax for disambiguation
- D-08: Add optional `repo` parameter to search tools, filters by `repoId` in Qdrant
- D-09: `repo` parameter accepts single string (not array)

### Agent's Discretion

- Exact grouping separator format in text output
- Whether `get_module_dependencies` also gets repo awareness in this phase
- Error message wording for invalid repo filter values
- Whether to surface repo count/names in search result summary header

### Deferred Ideas (OUT OF SCOPE)

None
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                    | Research Support                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| SRCH-01 | search_codebase and search_codebase_hybrid always query all repos, results include repo origin | `repoId` already in ChunkPayload; add to RetrievalResult, pass through formatResult. No filter = all repos. |
| SRCH-03 | get_file and get_dependencies resolve files across all configured repos                        | Extend engine.getFile to query without repo filter (returns all), or iterate RepoRegistry entries           |
| SRCH-04 | Search results display repo name alongside file path (e.g. `[core] src/Payment.java`)          | Modify `buildCodeAnchor()` in result-formatting.ts to prepend `[repoId]`                                    |

</phase_requirements>

## Standard Stack

No new libraries needed. All changes use existing dependencies.

### Core (already in place)

| Library                | Version | Purpose                           | Why Standard                          |
| ---------------------- | ------- | --------------------------------- | ------------------------------------- |
| zod                    | ^4.3.6  | Input validation for `repo` param | Already used for all MCP tool schemas |
| @qdrant/js-client-rest | ^1.17.0 | Payload filtering by `repoId`     | Already supports filter conditions    |

## Architecture Patterns

### Pattern 1: Qdrant Payload Filter for Repo Scoping

**What:** When `repo` param is provided, add a `must` filter condition matching `repoId` field.
**When to use:** In search tool handlers before calling engine.

**Example:**

```typescript
// In search handler, construct filter when repo param provided
const repoFilter = input.repo
  ? { must: [{ key: 'repoId', match: { value: input.repo } }] }
  : undefined;

// Pass to engine search call
const results = await engine.search({
  text: input.query,
  limit: input.limit ?? 10,
  filter: repoFilter,
});
```

### Pattern 2: Result Grouping by Repo (D-03, D-04)

**What:** After retrieval, group results by `repoId`, sort groups by best score, format with repo headers.
**When to use:** In `buildSearchResponse()` and `formatResult()`.

```typescript
function groupByRepo(results: RetrievalResult[]): Map<string, RetrievalResult[]> {
  const groups = new Map<string, RetrievalResult[]>();
  for (const r of results) {
    const repo = r.repoId ?? 'unknown';
    if (!groups.has(repo)) groups.set(repo, []);
    groups.get(repo)!.push(r);
  }
  // Sort groups by best score in each (D-04)
  return new Map(
    [...groups.entries()].sort((a, b) => {
      const bestA = Math.max(...a[1].map((r) => r.score));
      const bestB = Math.max(...b[1].map((r) => r.score));
      return bestB - bestA;
    }),
  );
}
```

### Pattern 3: Repo-Prefixed Path Resolution (D-07)

**What:** Parse `repo:path/to/file.ts` syntax in get_file/get_dependencies.
**When to use:** Input parsing for get_file and get_dependencies.

```typescript
function parseRepoPath(input: string): { repo?: string; path: string } {
  const match = input.match(/^([a-z0-9-]+):(.+)$/);
  if (match) return { repo: match[1], path: match[2] };
  return { path: input };
}
```

### Pattern 4: Multi-Repo File Resolution (D-06)

**What:** When no `repo:` prefix, query Qdrant for file path across all repos, return all matches with attribution.
**When to use:** get_file and get_dependencies handlers.

```typescript
// Query engine.getFile without repo filter — returns chunks from all repos
// Group by repoId for display
const results = await engine.getFile(input.path); // already searches all data in collection
const byRepo = new Map<string, RetrievalResult[]>();
for (const r of results) {
  const repo = r.repoId ?? 'default';
  if (!byRepo.has(repo)) byRepo.set(repo, []);
  byRepo.get(repo)!.push(r);
}
```

### Pattern 5: RetrievalResult Extension

**What:** Add `repoId` to `RetrievalResult` type, populate from `ChunkPayload.repoId` during search result mapping.

```typescript
// In RetrievalResult interface (packages/retrieval/src/types.ts)
/** Source repository identifier (from ChunkPayload.repoId) */
repoId?: string | undefined;
```

### Anti-Patterns to Avoid

- **Separate queries per repo:** Don't query Qdrant once per repo. Use single query, group results post-retrieval. Exception: when `repo` filter is set.
- **Conditional prefix logic:** Don't check "is single repo?" — always show `[repo]` prefix per D-02.

## Don't Hand-Roll

| Problem              | Don't Build           | Use Instead                         | Why                                   |
| -------------------- | --------------------- | ----------------------------------- | ------------------------------------- |
| Repo name validation | Custom validation     | `RepoRegistry.getRepo(name)`        | Already validates existence           |
| Qdrant filtering     | Custom filter builder | Direct `{ must: [{ key, match }] }` | Qdrant filter syntax is simple enough |

## Common Pitfalls

### Pitfall 1: Forgetting to propagate repoId from payload to RetrievalResult

**What goes wrong:** Results display without repo attribution
**Why it happens:** `SearchEngine` maps `ChunkPayload` → `RetrievalResult` but skips new fields
**How to avoid:** Update the mapping in `search-engine.ts` where payload is spread into RetrievalResult
**Warning signs:** Tests pass but `[repo]` prefix shows as `[unknown]`

### Pitfall 2: Filter not passed through all search paths

**What goes wrong:** `repo` param works for semantic but not keyword/existence/aggregation routes
**Why it happens:** `search-codebase.ts` has 4+ code paths (keyword, existence, aggregation, semantic)
**How to avoid:** Pass filter at the engine level, not per-route. Or ensure each route passes it.
**Warning signs:** Filtering works for some queries but not others

### Pitfall 3: Grouping breaks token cap logic

**What goes wrong:** Token cap trims results before grouping, leading to missing repos in output
**Why it happens:** `applyTokenCap` runs before repo grouping
**How to avoid:** Apply grouping AFTER token cap (cap is about total output size, grouping is display)
**Warning signs:** Small limits show only one repo even when both have relevant results

### Pitfall 4: get_file returns duplicate chunks from same repo

**What goes wrong:** Same file appears twice in output
**Why it happens:** Both ast and llm collections may have same file indexed
**How to avoid:** `MultiCollectionSearchEngine.getFile()` already dedupes by chunkId — verify it still works with repoId grouping

## Code Examples

### Adding repo field to RetrievalResult (types.ts)

```typescript
// Add after 'expansionSource' field:
/** Source repository identifier (kebab-case from RepoRegistry) */
repoId?: string | undefined;
```

### Modified buildCodeAnchor (result-formatting.ts)

```typescript
export function buildCodeAnchor(result: {
  relativePath: string;
  startLine: number;
  endLine: number;
  name?: string | undefined;
  repoId?: string | undefined;
}): string {
  const lines = `${result.startLine}-${result.endLine}`;
  const repoPrefix = result.repoId ? `[${result.repoId}] ` : '';
  return result.name
    ? `${repoPrefix}${result.relativePath}:${lines} (${result.name})`
    : `${repoPrefix}${result.relativePath}:${lines}`;
}
```

### Adding repo param to search tool schema

```typescript
inputSchema: {
  query: z.string().describe('Natural language search query'),
  repo: z.string().optional().describe('Filter results to a specific repo by name. When omitted, searches all repos.'),
  // ... existing params
},
```

### Structured content with repo field (D-01)

```typescript
// In structuredContent of responses, add repo to each result object
structuredContent: {
  answered: true,
  results: results.map(r => ({
    file: r.relativePath,
    repo: r.repoId ?? 'default',
    name: r.name,
    score: r.score,
  })),
}
```

## Validation Architecture

### Test Framework

| Property           | Value                                         |
| ------------------ | --------------------------------------------- |
| Framework          | Vitest 4.1.2                                  |
| Config file        | `vitest.config.ts` (workspace)                |
| Quick run command  | `pnpm --filter @ia-framework/mcp-server test` |
| Full suite command | `pnpm test`                                   |

### Phase Requirements → Test Map

| Req ID  | Behavior                               | Test Type | Automated Command                                                                                  | File Exists? |
| ------- | -------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- | ------------ |
| SRCH-01 | Search results include repoId field    | unit      | `pnpm --filter @ia-framework/mcp-server vitest run src/tools/search-codebase.test.ts -t "repo"`    | ❌ Wave 0    |
| SRCH-01 | Results grouped by repo                | unit      | `pnpm --filter @ia-framework/mcp-server vitest run src/tools/search-codebase.test.ts -t "grouped"` | ❌ Wave 0    |
| SRCH-03 | get_file resolves across repos         | unit      | `pnpm --filter @ia-framework/mcp-server vitest run src/tools/get-file.test.ts -t "multi-repo"`     | ❌ Wave 0    |
| SRCH-03 | repo:path prefix parsing               | unit      | `pnpm --filter @ia-framework/mcp-server vitest run src/tools/get-file.test.ts -t "prefix"`         | ❌ Wave 0    |
| SRCH-04 | buildCodeAnchor includes [repo] prefix | unit      | `pnpm --filter @ia-framework/mcp-server vitest run src/tools/result-formatting.test.ts -t "repo"`  | ❌ Wave 0    |

### Sampling Rate

- **Per task commit:** `pnpm --filter @ia-framework/mcp-server test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Test cases for repo filtering, grouping, prefix display in search-codebase
- [ ] Test cases for multi-repo resolution in get-file
- [ ] Test cases for `repo:path` parsing

## Sources

### Primary (HIGH confidence)

- Direct source code reading: `packages/mcp-server/src/tools/*.ts`, `packages/retrieval/src/types.ts`, `packages/vector-store/src/interface.ts`, `packages/core/src/config/registry.ts`
- `ChunkPayload.repoId` field confirmed present (line 34 of interface.ts)
- `RetrievalQuery.filter` already supports arbitrary Qdrant filters
- `HybridEngine.searchHybrid` already accepts `filter` parameter

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - no new deps, all existing
- Architecture: HIGH - direct code reading, clear modification points
- Pitfalls: HIGH - based on understanding actual code paths

**Research date:** 2026-05-22
**Valid until:** 2026-06-22 (stable internal codebase)
