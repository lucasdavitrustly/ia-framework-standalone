# Feature Specification: Resilient `get_file` Repo Resolution When Repo Is Unspecified

**Feature Branch**: `017-fix-getfile-repo-resolution`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "When the LLM can not define the repo, in the search it fails to retrieve files from mcp get_file. How to solve that?"

## Overview

When an AI assistant calls the `get_file` tool without a `repo:` prefix in the
path (because it does not know, or cannot determine, which indexed repository a
file belongs to), file retrieval can fail even when the file physically exists
on disk under one of the configured repositories. The assistant receives a
"No indexed chunks found" message or empty/stale content, with no actionable
guidance, and cannot recover without already knowing the repo it was trying to
discover.

This feature makes `get_file` resolve and return the requested file whenever it
is reachable under any configured repository, regardless of whether the caller
supplied a repo prefix, and provides clear, actionable disambiguation or
diagnostics when it cannot.

## Problem Statement

In a multi-repository index, every retrieved file path is relative to its
owning repository root. The `get_file` tool accepts an optional `repo:path`
prefix to disambiguate. When the prefix is omitted, the tool derives the owning
repository from the indexed chunk metadata returned by the index lookup.

This derivation breaks in the following situations:

1. **No chunks match the requested path.** The index lookup keys strictly on the
   stored relative path. If the caller's path differs by even a leading segment,
   casing, or separator — or if the file was indexed under a lean-payload schema
   that stores no direct path match — the lookup returns zero chunks. Because a
   filesystem-read function is configured, the existing semantic-search fallback
   is skipped, and the tool returns "No indexed chunks found" without ever
   attempting to read the file from disk under any configured repository.

2. **The repo cannot be inferred and no prefix was given.** With nothing in the
   index to anchor on, the tool has no repository to resolve a root path from, so
   it cannot construct an absolute path to attempt a read.

3. **Silent degradation.** When a read does fail, the caller often receives empty
   or stored-only content with no explicit signal that the failure was caused by
   an unresolved or wrong repository, so the assistant cannot self-correct (for
   example, by retrying with an explicit `repo:` prefix).

**Impact**: AI assistants lose access to files that are present and readable,
degrading the quality of AI-assisted development. The assistant is placed in a
chicken-and-egg situation: to read a file it must name the repo, but the whole
reason it called `get_file` was to discover the file without knowing the repo.

## Clarifications

### Session 2026-07-06

- Q: When the caller omits a repo prefix and the index yields no chunk to infer
  the repo from, how should the tool attempt to locate the file? → A: Perform a
  direct existence check (not a search or directory scan) of the relative path
  against each configured repository root, in configuration order. This costs one
  filesystem check per configured repository and emits no tokens itself.
- Q: For token efficiency, is it better to auto-resolve across repositories or to
  ask the caller which repository to look in? → A: Auto-resolve by default,
  because it is cheaper and avoids a chicken-and-egg round-trip (the caller often
  omitted the prefix precisely because it does not know the repo). The direct
  existence check produces no tokens; the response only carries the file the
  caller already wanted. Asking is reserved for the one case where auto-resolution
  would be expensive — a common relative path present in MANY repositories — where
  returning every copy would waste tokens.
- Q: How should ambiguity (path present in more than one repository) be handled to
  stay token-efficient? → A: Tiered by match count. Exactly one match → return it.
  A small number of matches (up to a configured threshold, default 3) → return the
  copies grouped by repository. More than the threshold → do NOT return content;
  return a short candidate list of `repo:path` options and ask the caller to
  re-issue with a `repo:` prefix.
- Q: How should the tool signal an unrecoverable failure (no repo has the file)?
  → A: Per-response diagnostics — a clear message listing the configured
  repositories that were searched, the resolved relative path, and the most
  likely causes (path mismatch, moved/deleted file, or misconfigured repo root),
  plus explicit guidance to retry with a `repo:` prefix. No file content is
  emitted.
- Q: Does the fallback existence check attempt any path normalization/matching
  (separators, casing, leading-segment trimming), or only an exact join? → A:
  Exact join only. The check tests `repoRoot + relativePath` verbatim per repo;
  paths that differ by separator, casing, or a leading segment fall through to
  the not-found diagnostic, which instructs the caller to correct the path. No
  normalization, fuzzy matching, or directory scan is performed, preserving the
  one-`stat`-per-repo cost bound.
- Q: How is a file resolved by the existence-check fallback signaled versus a
  normal index-inferred success? → A: A distinct, non-error indicator (e.g.
  `resolvedVia: "filesystem-fallback"`) marks success via the existence check
  (found on disk, no matching index chunk). This is separate from the
  degraded/error flag used for read failures or degraded conditions, so the
  caller can distinguish fully-trustworthy content found outside the index from
  genuinely degraded results.

## Actors

- **AI assistant (primary caller)**: Invokes `get_file`, frequently without a
  repo prefix, while exploring an unfamiliar multi-repo codebase.
- **Developer**: Consumes the assistant's output; benefits when file context is
  retrieved reliably and suffers when it is silently missing.
- **MCP server operator**: Configures the set of repositories and their root
  paths that the server can read from.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Retrieve a file without knowing its repo (Priority: P1)

An AI assistant needs the contents of a file it saw referenced (for example,
`src/main/java/com/example/Foo.java`) but does not know which of several indexed
repositories owns it. It calls `get_file` with just the relative path, no
prefix.

**Why this priority**: This is the exact failure the user reported and the core
value of the feature. Without it, the tool is unreliable for its most common
exploratory use.

**Independent Test**: Configure two or more repositories, place the target file
under exactly one of them, and call `get_file` with the bare relative path (no
prefix). The tool returns the live file content from the correct repository.

**Acceptance Scenarios**:

1. **Given** a multi-repo configuration where the requested relative path exists
   in exactly one repository, **When** the assistant calls `get_file` with the
   bare relative path (no `repo:` prefix), **Then** the tool returns the live
   file content read from that repository's root.
2. **Given** the index has no chunk matching the requested relative path but the
   file exists on disk under a configured repository, **When** the assistant
   calls `get_file` with the bare relative path, **Then** the tool reads and
   returns the file from disk instead of reporting "No indexed chunks found".

---

### User Story 2 - Disambiguate a path present in multiple repos (Priority: P2)

The same relative path (for example, `pom.xml`) exists under more than one
configured repository. The assistant calls `get_file` without a prefix. The tool
must disambiguate token-efficiently: return the copies when there are only a few,
but avoid dumping many full files when the path is common across repositories.

**Why this priority**: Common relative paths collide across repos; the assistant
must be able to choose the right one rather than get a wrong or arbitrary file —
without paying to receive every copy when the collision is wide.

**Independent Test**: Place an identically-named relative path under two repos,
call `get_file` with the bare path, and verify the response contains both copies
grouped by repository along with guidance to re-issue with a `repo:` prefix. Then
place the same path under more repos than the threshold and verify the response
returns only a candidate list (no content) asking the caller to pick a repo.

**Acceptance Scenarios**:

1. **Given** the requested relative path exists under a small number of
   repositories (at or below the configured threshold), **When** the assistant
   calls `get_file` without a prefix, **Then** the tool returns each repository's
   copy grouped under a clear per-repository heading.
2. **Given** the requested relative path exists under more repositories than the
   configured threshold, **When** the assistant calls `get_file` without a prefix,
   **Then** the tool returns a short candidate list of `repo:path` options WITHOUT
   file content and asks the caller to re-issue with a `repo:` prefix.
3. **Given** a multi-repo match is returned, **When** the assistant reads the
   response, **Then** it includes explicit instructions to re-issue the call with
   a `repo:` prefix to target a single repository.

---

### User Story 3 - Actionable diagnostics when the file cannot be found (Priority: P2)

The requested relative path exists in no configured repository (typo, moved or
deleted file, or misconfigured repo root). The assistant calls `get_file`
without a prefix.

**Why this priority**: A silent empty result strands the assistant; clear
diagnostics let it self-correct or report a precise problem to the developer.

**Independent Test**: Call `get_file` with a path that does not exist under any
repository and verify the response names the repositories searched, the resolved
relative path, likely causes, and how to retry.

**Acceptance Scenarios**:

1. **Given** the relative path is not present under any configured repository,
   **When** the assistant calls `get_file` without a prefix, **Then** the tool
   returns a diagnostic that lists the repositories searched and the resolved
   relative path.
2. **Given** the diagnostic response, **When** the assistant reads it, **Then**
   it includes the most likely causes (path mismatch, moved/deleted file,
   misconfigured repo root) and guidance to retry with a `repo:` prefix.
3. **Given** a response was produced via the existence-check fallback or a
   degraded path, **When** the assistant inspects the response metadata, **Then**
   a distinct non-error indicator marks filesystem-fallback success while a
   separate flag marks degraded/error resolution — the two are not conflated.

---

### Edge Cases

- **Repo prefix supplied but unknown**: When a caller supplies a `repo:` prefix
  that is not a configured repository, the tool returns an explicit error naming
  the configured repositories rather than silently reading from a default repo.
- **Some repos inaccessible**: When one or more configured repository roots are
  unreadable, the tool still searches the accessible ones and clearly reports
  which repositories were skipped and why.
- **Path resolves in an accessible repo but read fails mid-way**: The tool
  reports the read failure for that repository and continues attempting other
  repositories rather than aborting the whole request.
- **Bare path that collides with the prefix syntax**: A relative path that could
  be mistaken for a `repo:` prefix (for example, a leading token followed by a
  colon) is treated as a path, not a prefix, unless it matches a configured
  repository name.
- **Line-range and name filters with no prefix**: The `startLine`/`endLine` and
  `name` filters continue to work when the repo is resolved by fallback, applied
  consistently across each repository match.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST return the requested file when the relative path is
  reachable under any configured repository, whether or not the caller supplied a
  `repo:` prefix.
- **FR-002**: When no `repo:` prefix is supplied and the index yields no chunk to
  infer the owning repository, the system MUST attempt to locate the relative path
  via a direct existence check at each configured repository root before reporting
  failure. The check MUST test `repoRoot + relativePath` verbatim (exact join, no
  separator/case normalization, no leading-segment trimming, no fuzzy matching).
  This resolution MUST NOT perform a semantic search or a recursive directory
  scan, and MUST NOT emit tokens for repositories that do not contain the path.
  Paths that miss on every repository fall through to the not-found diagnostic
  (FR-005).
- **FR-003**: When the relative path is present under exactly one repository, the
  system MUST return that repository's file content and identify the resolved
  repository in the response.
- **FR-004**: When the relative path is present under more than one repository and
  no prefix was supplied, the system MUST disambiguate token-efficiently by match
  count: at or below a configured threshold (default 3), it MUST return all
  matches grouped by repository with instructions to retry with a `repo:` prefix;
  above the threshold, it MUST return only a short candidate list of `repo:path`
  options WITHOUT file content and ask the caller to retry with a `repo:` prefix.
- **FR-005**: When the relative path is present under no configured repository,
  the system MUST return a diagnostic that lists the repositories searched, the
  resolved relative path, the most likely causes, and guidance to retry with a
  `repo:` prefix, and MUST NOT emit file content.
- **FR-006**: When a caller supplies a `repo:` prefix that is not a configured
  repository, the system MUST return an explicit error that names the configured
  repositories, and MUST NOT silently read from a different repository.
- **FR-007**: The system MUST skip repositories whose roots are inaccessible when
  performing fallback resolution, and MUST report which repositories were skipped
  and why.
- **FR-008**: The system MUST include machine-readable indicators in the response
  metadata that distinguish resolution provenance: (a) a distinct, non-error
  indicator (e.g. `resolvedVia: "filesystem-fallback"`) when a file is resolved
  successfully via the existence-check fallback with no matching index chunk, and
  (b) a separate degraded/error flag when a read fails or the response is produced
  under degraded conditions. A successful fallback resolution MUST NOT be
  conflated with a degraded result.
- **FR-009**: The `startLine`/`endLine` and `name` filters MUST be honored when a
  repository is resolved by fallback, applied consistently per repository match.
- **FR-010**: The system MUST NOT change existing behavior when a valid `repo:`
  prefix is supplied or when the owning repository is unambiguously inferable from
  the index.
- **FR-011**: The system MUST bound the additional cost of fallback resolution so
  that a request across the configured repositories performs at most one direct
  path check per configured repository, scans no unrelated directory trees, and
  emits no file content for repositories that do not contain the path.
- **FR-012**: The threshold above which the system returns a candidate list
  instead of grouped file content MUST be configurable, with a token-conservative
  default (3).

### Key Entities *(include if feature involves data)*

- **Repository configuration entry**: A named repository with an absolute root
  path, used to resolve relative paths to absolute paths. Has an accessibility
  status (accessible / inaccessible with reason).
- **File retrieval request**: A caller request consisting of a path (optionally
  carrying a `repo:` prefix), and optional `startLine`/`endLine` or `name`
  filters.
- **File retrieval response**: The returned content plus metadata identifying the
  resolved repository (or repositories), whether a fallback/degraded path was
  used, and any diagnostics.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a multi-repo configuration, 100% of `get_file` calls for a
  relative path that exists under exactly one accessible repository return that
  file's content, whether or not a `repo:` prefix was supplied.
- **SC-002**: For a relative path that exists under multiple repositories, the
  response identifies every repository containing the path (as grouped content at
  or below the threshold, or as a content-free candidate list above it) and
  instructs the caller how to target one, with zero cases of returning an
  arbitrary or wrong repository's file.
- **SC-003**: For a relative path that exists under no configured repository,
  100% of responses include the list of repositories searched and explicit
  retry guidance, with zero silent empty responses and zero file content emitted.
- **SC-004**: Every response produced via the existence-check fallback or a
  degraded path carries a machine-readable indicator, and filesystem-fallback
  success is distinguishable from degraded/error resolution in 100% of such cases,
  enabling the caller to react appropriately.
- **SC-005**: Fallback resolution for a request adds at most one direct path
  check per configured repository, performs no recursive directory scan, and
  emits no tokens for non-matching repositories, keeping added latency and token
  cost proportional to the number of matching repositories rather than the size
  of the codebase.
- **SC-007**: In the common single-match case, an auto-resolved `get_file` call
  returns in a single round-trip and emits the same content it would have emitted
  had the caller supplied the correct `repo:` prefix — i.e. auto-resolution adds
  zero token overhead versus a correctly-prefixed call.
- **SC-006**: All previously passing `get_file` scenarios (valid prefix supplied,
  single inferable repo, multi-repo grouping when chunks exist) continue to pass
  unchanged.

## Assumptions

- The MCP server is configured with one or more repositories, each mapped to an
  absolute root path; a single-repository configuration is a special case of this.
- Relative paths supplied by callers are intended to be interpreted relative to a
  repository root, consistent with how paths are stored in the index.
- Reading a file directly at `repository_root + relative_path` is an acceptable
  and sufficient existence check; recursive filesystem search for misspelled or
  relocated paths is out of scope.
- The existing repo-prefix parsing, multi-repo grouping, and per-response
  degradation-metadata mechanisms are available to build upon.
- Correcting the underlying working-directory/root resolution and native
  dependency startup behavior is covered by the separate Node 26+ compatibility
  work and is not re-specified here; this feature assumes configured roots are
  correct and focuses on repo resolution when the caller omits the prefix.
