# Quickstart — Verify Resilient `get_file` Repo Resolution (feature 017)

## Reproduce the bug (before the fix)

1. Configure the MCP server with two or more repos in `.ia-framework/project.json`
   (or via `McpServerConfig.repos`).
2. Pick a file that exists on disk under exactly one repo but is either not
   indexed or indexed under a lean-payload schema whose stored `relativePath`
   does not exactly match the path you request.
3. Call the tool without a prefix:
   ```
   get_file(path="src/main/java/com/example/Foo.java")
   ```
4. **Observed (buggy)**: `No indexed chunks found for: src/...Foo.java` — even
   though the file is present and readable. The filesystem was never consulted
   because a `readFileFn` is configured and the empty-result branch skips the
   fallback.

## Verify the fix

### P1 — single-repo auto-resolution
- Same call as above. **Expected**: full file content returned, with
  `structuredContent.resolvedVia === "filesystem-fallback"`.

### P2 — grouped disambiguation (≤ threshold)
- Place the same relative path (e.g. `pom.xml`) under two repos.
- Call `get_file(path="pom.xml")`. **Expected**: both copies grouped under
  `## [repoA]` / `## [repoB]` with guidance to retry using a `repo:` prefix;
  `structuredContent.multiRepo === true`.

### P2 — candidate list (> threshold)
- Place the same path under more repos than the threshold (default 3).
- Call `get_file(path="index.ts")`. **Expected**: NO file content; a short
  `candidates` list of `repo:path` options and an instruction to retry with a
  prefix; `structuredContent.candidates` populated.

### P3 — not-found diagnostic
- Call `get_file(path="does/not/exist.ts")`. **Expected**: diagnostic listing
  `reposSearched`, the resolved relative path, likely causes, and retry guidance;
  no file content; no silent empty response.

### Regression — existing behavior unchanged
- `get_file(path="core:src/known/Indexed.ts")` with a valid prefix and an index
  hit → content with `resolvedVia: "index"` (or absent legacy value), identical
  to today.
- `get_file(path="badrepo:src/x.ts")` with an unknown prefix → explicit error
  naming configured repos; no read attempted.

## Run the tests

```bash
pnpm --filter @ia-framework/mcp-server test
# or focused:
pnpm --filter @ia-framework/mcp-server test get-file
```

All new assertions in `packages/mcp-server/src/tools/get-file.test.ts` and the
closure-wiring assertions in `packages/mcp-server/src/server.test.ts` must pass,
and every pre-existing `get_file` test must remain green (SC-006).

## Full check

```bash
pnpm test && pnpm build
```
