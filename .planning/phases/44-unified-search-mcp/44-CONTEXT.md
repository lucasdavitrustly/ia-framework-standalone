# Phase 44: Unified Search & MCP - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

All MCP search tools return results from all repos with clear source attribution. `search_codebase` and `search_codebase_hybrid` query all indexed repos in a single query. Each result displays repo name alongside file path. `get_file` and `get_dependencies` resolve files from any configured repo. MCP tool response JSON includes `repo` field in each result object.

</domain>

<decisions>
## Implementation Decisions

### Result attribution format

- **D-01:** Both JSON `repo` field in response objects AND `[repo-name]` prefix in the display anchor string. Maximum clarity for AI parsing and human reading.
- **D-02:** `[repo-name]` prefix always shown, even in single-repo projects. Consistent, no conditional logic.

### Cross-repo ranking

- **D-03:** Results grouped by repo, not interleaved. Each repo forms a cluster in the output.
- **D-04:** Repo groups ordered by best-match — repo with highest-scoring single result appears first. Within each group, results ordered by relevance.
- **D-05:** Natural distribution when `limit` is set — proportional representation based on hit count, no artificial balancing across repos.

### Path resolution for get_file/get_dependencies

- **D-06:** Auto-resolve paths across all repos. If same relative path exists in multiple repos, return all matches with repo attribution.
- **D-07:** Support optional `repo:path/to/file.ts` prefix syntax for explicit disambiguation. When prefix present, scope to that repo only. When absent, auto-resolve across all repos.

### Repo filtering in search

- **D-08:** Add optional `repo` parameter to `search_codebase` and `search_codebase_hybrid`. When provided, Qdrant query filters by `repoId` payload field. When omitted, searches all repos.
- **D-09:** `repo` parameter accepts a single repo name string (not array). Covers primary use case simply.

### Agent's Discretion

- Exact grouping separator format in text output (e.g. `--- [repo-name] ---` header or similar)
- Whether `get_module_dependencies` also gets repo awareness in this phase or deferred
- Error message wording for invalid repo filter values
- Whether to surface repo count/names in search result summary header

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### MCP tool implementations

- `packages/mcp-server/src/tools/search-codebase.ts` — Semantic search tool, needs repo filter param + grouped output
- `packages/mcp-server/src/tools/search-codebase-hybrid.ts` — Hybrid search tool, same changes as semantic
- `packages/mcp-server/src/tools/get-file.ts` — File retrieval, needs multi-repo path resolution + `repo:` prefix parsing
- `packages/mcp-server/src/tools/get-dependencies.ts` — Dependency tool, needs same path resolution as get_file
- `packages/mcp-server/src/tools/result-formatting.ts` — `buildCodeAnchor()` and `formatRetrievalContext()` need repo prefix

### Payload schema

- `packages/vector-store/src/interface.ts` — `ChunkPayload` with `repoId?: string` field (already added in Phase 43)

### Repo registry (from Phase 42)

- `packages/core/src/repo-registry.ts` — RepoRegistry class for resolving repo names and paths

### Requirements

- `.planning/REQUIREMENTS.md` §Search — SRCH-01, SRCH-03, SRCH-04

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `RepoRegistry` class: resolves repo names to paths, validates repo existence — use for `repo` param validation
- `ChunkPayload.repoId` field: already in Qdrant payloads from Phase 43 indexing — filter directly
- `buildCodeAnchor()` in result-formatting.ts: single point to add `[repo]` prefix to display strings

### Established Patterns

- MCP tools use Zod schemas for input validation — add `repo` as optional z.string() param
- Qdrant filtering via payload conditions — add `repoId` match condition when repo param present
- Fallback pattern in get_file (try getFile, fall back to search) — extend to multi-repo resolution

### Integration Points

- `search-codebase.ts` and `search-codebase-hybrid.ts` both call the retrieval engine — add Qdrant filter at query level
- `result-formatting.ts` is shared by all tools — single change propagates repo prefix everywhere
- `get-file.ts` resolves by path — needs to iterate repos or query without path filter

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

_Phase: 44-unified-search-mcp_
_Context gathered: 2026-05-22_
