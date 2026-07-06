# Phase 0 — Research: Resilient `get_file` Repo Resolution

All Technical Context fields were resolvable from the existing codebase; no
`NEEDS CLARIFICATION` markers remained after the spec's clarification session.
This document records the decisions that shape the implementation.

## Decision 1 — Where the fallback lives

**Decision**: Implement the cross-repo existence-check fallback inside
`getFileHandler` (`packages/mcp-server/src/tools/get-file.ts`), triggered when
`engine.getFile()` returns zero results, no `repo:` prefix was supplied, and a
filesystem-read capability is configured.

**Rationale**: The current empty-result branch (get-file.ts, the
`results.length === 0 && !readFileFn && engine.search` guard) explicitly skips
the semantic fallback when `readFileFn` is present, then falls straight to the
"No indexed chunks found" return. That is the exact defect. The handler already
owns response shaping (single, multi-repo grouped, stored-content, diagnostics),
so the new tier logic belongs alongside it.

**Alternatives considered**:
- *Fix in the retrieval engine (`search-engine.ts` / `multi-collection-search-engine.ts`)*
  — rejected. The engine is index-only and repo-agnostic about filesystem roots;
  it has no access to `repoPathMap` or accessibility state. Pushing filesystem
  concerns into retrieval violates package boundaries (Principle IV).
- *Change indexing so lean-payload chunks always match on path* — rejected. Out of
  scope; does not help the moved/renamed-file or path-mismatch cases, and touches
  the incremental indexing path (Principle VI) unnecessarily.

## Decision 2 — How the handler enumerates repos

**Decision**: Extend `GetFileOptions` with an injected capability that exposes the
configured repositories and their accessibility, plus a way to read a relative
path from a specific repo. Concretely, add
`resolveFileAcrossRepos?: (relativePath, opts) => Promise<RepoResolution[]>` (or an
equivalent `repos` descriptor + reuse of the existing `readFileFn`) constructed in
`createMcpServer`.

**Rationale**: The existing `readFileFn`/`statFn` closures in server.ts already
close over `repoPathMap`, `resolveRoot`, `assertAccessible`, and
`repoAccessibility`. Those are precisely the inputs the fallback needs. Injecting
a thin capability keeps get-file.ts free of `node:fs`/path knowledge (it stays
testable with in-memory fakes, matching the current test style that passes
`readFileFn` mocks) and keeps repo/root resolution centralized in server.ts
(single source of truth, already validated at startup by `validateRepoPaths`).

**Alternatives considered**:
- *Pass raw `repoPathMap` into the handler* — rejected. Leaks filesystem/path
  concerns into the tool layer and duplicates `resolveRepoRoot` logic.
- *Call `readFileFn(path, repo)` in a loop over a repo-name list* — viable and
  simplest; acceptable if the handler is also given the ordered repo-name list and
  accessibility map. The chosen approach is a light wrapper over exactly this.

## Decision 3 — Exact-join existence check (no normalization)

**Decision**: The fallback checks `repoRoot + relativePath` verbatim per repo
using a single `stat`/read attempt. No separator/case normalization, no
leading-segment trimming, no directory scan. (Spec Clarification Q1 → A.)

**Rationale**: Preserves the O(repos) cost bound (FR-011, SC-005). Fuzzy matching
would reintroduce ambiguity and unbounded cost, contradicting the token-efficiency
goal. Path-mismatch misses are surfaced by the not-found diagnostic (FR-005),
which instructs the caller to correct the path or add a prefix.

**Alternatives considered**: separator/case normalization (B) and single
leading-segment trim (C) — both rejected during clarification for cost/ambiguity.

## Decision 4 — Tiered disambiguation by match count

**Decision**: After the existence check yields matches:
- 1 match → return content (identify repo).
- 2..threshold (default 3) → return copies grouped by repo (reuse the existing
  `buildMultiRepoFileResponse` shape) with retry-with-prefix guidance.
- > threshold → return a content-free candidate list of `repo:path` options and
  ask the caller to retry with a prefix.
- 0 matches → not-found diagnostic (repos searched, resolved path, likely causes).

**Rationale**: Matches spec Clarification Q3. The existing multi-repo grouping
already exists for the index-chunk path; the fallback reuses it below the
threshold and adds only the above-threshold candidate-list branch. Threshold is
configurable with a token-conservative default (FR-012).

**Alternatives considered**: always group all copies (original spec draft) —
rejected on token cost for wide collisions (`pom.xml`, `index.ts`).

## Decision 5 — Provenance signaling

**Decision**: On successful existence-check fallback, set a distinct non-error
indicator in `structuredContent` (e.g. `resolvedVia: "filesystem-fallback"`),
kept separate from the existing `fallbackUsed`/degraded flag reused for read
failures/degraded conditions. (Spec Clarification Q2 → A.)

**Rationale**: Lets the caller distinguish "found on disk, not in index — fully
trustworthy" from "degraded/partial". The existing `withDegradation` merge in
`registerGetFileTool` already composes `structuredContent`; the new field is
additive and does not disturb it.

**Alternatives considered**: reuse one boolean (B) — rejected, conflates
trustworthy content with degradation; no flag (C) — rejected, hides provenance.

## Decision 6 — Testing approach (TDD)

**Decision**: Extend `get-file.test.ts` with failing tests first for: (a)
empty-index + file-on-disk single-repo resolution; (b) 2-repo grouped; (c)
above-threshold candidate list; (d) zero-repo diagnostic; (e) `resolvedVia` flag
present on fallback success and absent on normal success; (f) filters
(`startLine`/`endLine`, `name`) honored on fallback. Extend `server.test.ts` for
the injected capability enumerating repos + skipping inaccessible ones.

**Rationale**: Constitution Principle I. Existing tests already inject `readFileFn`
mocks, so the new capability is mockable without real filesystem or Qdrant.

## Summary

No unknowns remain. The feature is a localized, additive change to two files in
`packages/mcp-server`, reusing existing repo-path resolution, multi-repo grouping,
and degradation-metadata mechanisms. No engine, store, or indexing changes.
