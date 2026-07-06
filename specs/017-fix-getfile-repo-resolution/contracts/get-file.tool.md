# Contract: `get_file` MCP Tool (feature 017)

Defines the observable contract of the `get_file` tool after this feature.
Inputs are **unchanged**; outputs gain additive `structuredContent` fields and a
new above-threshold response shape. Backward compatibility is required (FR-010,
SC-006): every previously passing response shape is preserved.

## Input Schema (unchanged)

```jsonc
{
  "path": "string",         // required; may carry a "repo:" prefix
  "startLine": "number?",   // optional, coerced
  "endLine": "number?",     // optional, coerced
  "name": "string?"         // optional chunk/function-name filter
}
```

No new input fields. The disambiguation threshold is server configuration, not a
tool input.

## Output — `content[0].text` (human-readable) + `structuredContent` (machine-readable)

### Shape 1 — Single match (index or filesystem-fallback)
Full file (or sliced/filtered) content under `## File: <path>`.

```jsonc
"structuredContent": {
  "answered": true,
  "content": "<file or slice>",
  "chunks": [ /* indexed chunk metadata; may be [] on pure fallback */ ],
  "resolvedVia": "index" | "filesystem-fallback"
}
```
- `resolvedVia: "filesystem-fallback"` MUST appear only when the file was found by
  the exact-join existence check with no matching index chunk.
- `fallbackUsed` MUST NOT be set for a successful filesystem-fallback.

### Shape 2 — Grouped multi-repo (matches ≤ threshold)
Content grouped under `## [<repo>]` headings with retry-with-prefix guidance.

```jsonc
"structuredContent": {
  "answered": true,
  "multiRepo": true,
  "chunks": [ ... ],
  "resolvedVia": "index" | "filesystem-fallback"
}
```

### Shape 3 — Candidate list (matches > threshold) — NEW
No file content. Short list of `repo:path` options + instruction to retry with a
`repo:` prefix.

```jsonc
"structuredContent": {
  "answered": false,
  "candidates": ["repoA:src/Foo.java", "repoB:src/Foo.java", "..."],
  "resolvedVia": "filesystem-fallback"
}
```
- MUST NOT include file content.
- `content[0].text` lists candidates and the retry instruction.

### Shape 4 — Not found (0 matches on disk, no prefix)
Diagnostic only.

```jsonc
"structuredContent": {
  "answered": false,
  "reposSearched": ["repoA", "repoB", "..."],
  // no file content; no resolvedVia
}
```
- `content[0].text` MUST list repositories searched, the resolved relative path,
  likely causes (path mismatch / moved-deleted / misconfigured root), and
  retry-with-prefix guidance.
- Inaccessible repos that were skipped MUST still be named, with reason.

### Shape 5 — Unknown prefix error
When `repo:` prefix supplied but not configured.

```jsonc
"content": [{ "type": "text", "text": "Unknown repo '<r>' — configured repos: <list>" }]
```
- MUST NOT read from any other repo.

## Invariants

| ID | Invariant |
|----|-----------|
| C-1 | Input schema is unchanged; existing valid calls behave identically (FR-010). |
| C-2 | For a path present in exactly one accessible repo, content is returned regardless of prefix (FR-001, FR-003, SC-001). |
| C-3 | Existence check is exact-join, one attempt per repo, no recursion (FR-002, FR-011). |
| C-4 | No file content emitted for non-matching repos or above-threshold ambiguity (FR-004, FR-005, SC-005). |
| C-5 | `resolvedVia: "filesystem-fallback"` distinguishes fallback success from degradation; the two flags are never conflated (FR-008, SC-004). |
| C-6 | Filters (`startLine`/`endLine`, `name`) apply per matched repo on the fallback path (FR-009). |
| C-7 | Threshold default 3, configurable (FR-012). |

## Test Assertions (contract-level)

1. Empty index + file on disk in one repo → Shape 1 with `resolvedVia: "filesystem-fallback"`.
2. Empty index + path in two repos on disk → Shape 2.
3. Empty index + path in > threshold repos → Shape 3, `content` empty, `candidates` populated.
4. Empty index + path in zero repos → Shape 4, `reposSearched` populated, no content.
5. Valid prefix + index hit → Shape 1 with `resolvedVia: "index"`, no `resolvedVia` fallback value.
6. Unknown prefix → Shape 5 error, no read attempted.
7. Inaccessible repo present → excluded from reads, named in diagnostic (FR-007).
