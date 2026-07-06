# Phase 1 — Data Model: Resilient `get_file` Repo Resolution

This feature is behavioral, not persistent — no database entities. The "data
model" here is the in-memory shapes and the resolution decision table that
govern `get_file`'s fallback.

## Entities (in-memory)

### RepoConfigEntry
Configured repository the server may read from. Sourced from
`McpServerConfig.repos` (or the synthetic `_default` from `projectRoot`).

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | Repo id used as the `repo:` prefix. `_default` for single-repo. |
| `path` | `string` (absolute) | Root directory. |
| `accessible` | `boolean` | Computed at startup by `validateRepoPaths` (statSync). |
| `error` | `string?` | Reason when `accessible === false`. |

Ordering: configuration order (used for deterministic search order).

### GetFileRequest
Caller input (unchanged Zod schema).

| Field | Type | Notes |
|-------|------|-------|
| `path` | `string` | May carry a `repo:` prefix; parsed by `parseRepoPath`. |
| `startLine` | `number?` | Coerced. Applied per matched repo. |
| `endLine` | `number?` | Coerced. Applied per matched repo. |
| `name` | `string?` | Chunk/function name filter; applied per matched repo. |

### RepoResolution (new, internal)
Result of the exact-join existence check for one repo.

| Field | Type | Notes |
|-------|------|-------|
| `repo` | `string` | Repo name. |
| `found` | `boolean` | Whether `repoRoot + relativePath` exists/read succeeded. |
| `content` | `string?` | File content (or sliced range) when `found`. |
| `skipped` | `boolean` | True when repo was inaccessible and not checked. |
| `error` | `string?` | Read/skip reason. |

### GetFileResponseMeta (structuredContent additions)
Additive fields on the existing `structuredContent`.

| Field | Type | Notes |
|-------|------|-------|
| `resolvedVia` | `"index" \| "filesystem-fallback"?` | `filesystem-fallback` set only on successful existence-check resolution. Distinct from degradation. |
| `fallbackUsed` | `boolean?` | Existing flag — read failure / stored-content fallback. NOT set for successful filesystem-fallback. |
| `multiRepo` | `boolean?` | Existing — grouped multi-repo response. |
| `candidates` | `string[]?` | New — `repo:path` options when above threshold (content-free). |
| `reposSearched` | `string[]?` | New — repos checked in the not-found diagnostic. |

## Resolution Decision Table

Given a request with the `repo:` prefix already parsed (`repo`, `filePath`) and
`indexResults = engine.getFile(filePath, repo)`:

| Condition | Behavior | `resolvedVia` | Content emitted |
|-----------|----------|---------------|-----------------|
| `repo` supplied but unknown | Error naming configured repos (FR-006) | — | none |
| `indexResults` non-empty, single repo | Existing filesystem/stored path | `index` | file |
| `indexResults` non-empty, >1 repo, no prefix | Existing grouped multi-repo | `index` | grouped |
| `indexResults` empty, prefix supplied | Existence check that one repo only | `filesystem-fallback` if found | file or not-found |
| `indexResults` empty, no prefix → 0 matches on disk | Not-found diagnostic (FR-005): `reposSearched`, resolved path, causes, retry guidance | — | none |
| `indexResults` empty, no prefix → 1 match on disk | Return that repo's content (FR-003) | `filesystem-fallback` | file |
| `indexResults` empty, no prefix → 2..threshold matches | Grouped copies + retry guidance (FR-004) | `filesystem-fallback` | grouped |
| `indexResults` empty, no prefix → >threshold matches | Candidate list only, ask for prefix (FR-004) | `filesystem-fallback` | none (candidates) |

Notes:
- Inaccessible repos are skipped during the on-disk check and reported
  (`skipped`/`error`) per FR-007; they still appear in `reposSearched`.
- `startLine`/`endLine` and `name` filters apply to each matched repo's content
  (FR-009), mirroring the existing single/multi-repo paths.
- Threshold default = 3, configurable (FR-012).

## Validation Rules

- `parseRepoPath` unchanged: a leading `repo:` token is only treated as a prefix
  when it matches `^[a-z][a-z0-9-]*:` (avoids Windows drive-letter false
  positives). An unknown-but-well-formed prefix routes to the FR-006 error.
- Existence check is exact join only (no normalization) — spec Clarification Q1.
- No recursive directory traversal at any point (FR-011).
