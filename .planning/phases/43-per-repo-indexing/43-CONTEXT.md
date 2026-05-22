# Phase 43: Per-Repo Indexing - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Indexed chunks carry repo identity and repos can be re-indexed independently. Every chunk in Qdrant gets a `repoId` payload field. CLI accepts `--repo` flag to scope indexing to a specific repo. Re-indexing one repo does not affect other repos' chunks.

</domain>

<decisions>
## Implementation Decisions

### Selective re-indexing behavior

- **D-01:** `--repo <name>` uses normal incremental indexing (skip unchanged files based on git commit tracking). Only changed/new files are indexed.
- **D-02:** `--repo <name> --force` deletes ALL chunks with matching repoId from Qdrant, then re-indexes the entire repo from scratch.
- **D-03:** Without `--repo`, all repos are indexed sequentially. Each repo shows its own progress section in CLI output.

### Repo identity in payload

- **D-04:** `repoId` payload field value = the repo name string (kebab-case, from RepoRegistry). Human-readable, directly filterable in Qdrant.
- **D-05:** Repo name is immutable once indexed (carried forward from Phase 42 D-16). Rename = re-index required.

### CLI --repo flag UX

- **D-06:** Unknown `--repo` value = error with message listing all valid repo names from project.json. Fail fast.
- **D-07:** No `--repo` flag = index all configured repos sequentially.

### Backward compat for existing indexes

- **D-08:** On upgrade, a full re-index is required to add `repoId` to all existing chunks. Old chunks without repoId are not automatically valid.
- **D-09:** Detection: when search encounters chunks without `repoId`, log a warning suggesting re-index. Don't block usage — degrade gracefully.

### Agent's Discretion

- Exact warning message wording for missing repoId
- How to detect "upgrade happened" (version marker in Qdrant collection metadata, or presence of null repoId chunks)
- Progress reporting format per-repo during sequential indexing
- Whether to add a `ia-framework reindex` alias for `ia-framework index --force`

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Payload schema & Qdrant integration

- `packages/vector-store/src/interface.ts` — `ChunkPayload` interface (needs `repoId` field added)
- `packages/vector-store/src/qdrant.ts` — Upsert, delete, and filter logic

### Indexing pipeline

- `packages/cli/src/commands/index.command.ts` — CLI entry point, needs `--repo` flag
- `packages/indexer/` — IndexingPipeline that drives chunking and embedding

### Config & repo registry (Phase 42 output)

- `packages/core/src/config/schema.ts` — ProjectConfigSchema with repos[] array
- `packages/core/src/config/loader.ts` — loadConfig() with RepoRegistry normalization

### Requirements

- `.planning/REQUIREMENTS.md` — INDX-01, INDX-02, INDX-03 acceptance criteria

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `QdrantVectorStore.upsertBatch()`: Already handles payload insertion — add `repoId` to ChunkPayload
- `QdrantFilter` type: Already supports payload field filtering — use for scoped deletion
- `saveLastIndexedCommit()` / `getCurrentCommit()`: Git-based incremental detection — extend per-repo
- `RepoRegistry` (Phase 42): Source of truth for repo names and paths

### Established Patterns

- ChunkPayload mirrors ChunkMetadata from @ia-framework/core — both need the new field
- Config loaded once, passed via DI — RepoRegistry available throughout pipeline
- CLI uses commander with `.option()` — add `--repo <name>` option

### Integration Points

- `IndexingPipeline` needs repo context passed in (which repo is being indexed)
- `index.command.ts` loops over repos from RepoRegistry when no `--repo` specified
- Qdrant delete-by-filter: `client.delete(collection, { filter: { must: [{ key: "repoId", match: { value: name } }] } })`
- `getLastEmbeddingModel()` / `saveLastIndexedCommit()` need per-repo tracking (not global)

</code_context>

<specifics>
## Specific Ideas

- The `--repo` + `--force` combination is the "nuclear option" for a single repo — clear mental model
- Sequential per-repo indexing with individual progress sections keeps output readable
- Warning for missing repoId is non-blocking — existing users can continue working while they re-index at their convenience

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 43-per-repo-indexing_
_Context gathered: 2026-05-22_
