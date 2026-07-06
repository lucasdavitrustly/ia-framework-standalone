# Implementation Plan: Resilient `get_file` Repo Resolution When Repo Is Unspecified

**Branch**: `017-fix-getfile-repo-resolution` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-fix-getfile-repo-resolution/spec.md`

## Summary

When `get_file` is called without a `repo:` prefix and the index lookup returns
no chunk to infer the owning repository from, the tool currently reports "No
indexed chunks found" and never attempts a filesystem read — even when the file
exists on disk under a configured repo. The fix adds a **bounded, exact-join
existence-check fallback** across all configured repository roots, with
token-efficient tiered disambiguation (single match → return; ≤ threshold →
grouped copies; > threshold → content-free candidate list) and a distinct
`resolvedVia: "filesystem-fallback"` provenance indicator separate from the
existing degraded/error flag.

The change is localized to the MCP server: the `getFileHandler`
(`packages/mcp-server/src/tools/get-file.ts`) gains an empty-result fallback
path, and `createMcpServer` (`packages/mcp-server/src/server.ts`) injects a new
repo-enumeration capability into `GetFileOptions`. No changes to the retrieval
engine, indexing, or vector store are required.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js >= 22.0.0 (ESM)

**Primary Dependencies**: `@modelcontextprotocol/sdk@1.29.0`, `zod@4`,
`@ia-framework/retrieval` (SearchEngine / MultiCollectionSearchEngine),
`@ia-framework/observability` (unchanged). Node built-ins `node:fs/promises`
(`readFile`, `stat`) and `node:path` (`join`).

**Storage**: N/A for this feature — filesystem reads only; no vector store or
SQLite changes. Repo root paths come from existing `McpServerConfig.repos`.

**Testing**: Vitest. Unit tests co-located as
`packages/mcp-server/src/tools/get-file.test.ts` (extend existing) and
`packages/mcp-server/src/server.test.ts` (extend existing for closure wiring).

**Target Platform**: Local MCP server over stdio, consumed by OpenCode.

**Project Type**: Monorepo package (`packages/mcp-server`) — single-package change.

**Performance Goals**: Fallback adds at most one `stat`/`readFile` per configured
repository (typically 2–8); no recursive scan. Added latency proportional to repo
count, not codebase size (SC-005).

**Constraints**: Token-conservative — emit no file content for non-matching repos;
above-threshold ambiguity emits a candidate list only. Preserve all existing
behavior when a valid prefix is supplied or a single repo is inferable (FR-010,
SC-006).

**Scale/Scope**: 2 source files modified, 2 test files extended, ~1 new internal
helper. No new package, no new public dependency.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. TDD (Non-Negotiable) | PASS | New behavior specified as acceptance scenarios; tests written before implementation (Red-Green-Refactor). Extends existing `get-file.test.ts`. |
| II. TypeScript-Only | PASS | All changes in `.ts`; strict typing; Zod already validates `get_file` inputs (no schema change needed). |
| III. Local-First | PASS | Filesystem-only; no external service, no auth, no network. |
| IV. Monorepo Architecture | PASS | Change confined to `packages/mcp-server`; no new cross-package dependency; no circular deps introduced. |
| V. Simplicity & No Heavy Abstractions | PASS | One small injected capability (`resolveFileAcrossRepos`) reusing existing closures; no new framework. Complexity Tracking table empty. |
| VI. Incremental by Default | N/A | No indexing/processing path touched. |
| VII. MCP-First Interface | PASS | `get_file` continues to return structured, parseable responses; new provenance flag added to `structuredContent`. Tool schema unchanged. |

**Result**: PASS (initial). Re-checked post-Phase 1 — still PASS (see end of Phase 1).

## Project Structure

### Documentation (this feature)

```text
specs/017-fix-getfile-repo-resolution/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── get-file.tool.md # Phase 1 output — get_file response contract
├── checklists/
│   └── requirements.md  # From /speckit.specify
└── tasks.md             # /speckit.tasks output (NOT created here)
```

### Source Code (repository root)

```text
packages/mcp-server/
├── src/
│   ├── server.ts                 # MODIFY: inject resolveFileAcrossRepos capability
│   ├── server.test.ts            # EXTEND: closure enumerates repos + accessibility
│   ├── capabilities.ts           # (read-only) existing degradation metadata pattern
│   └── tools/
│       ├── get-file.ts           # MODIFY: empty-result fallback + tiered disambiguation
│       └── get-file.test.ts      # EXTEND: fallback, multi-repo tiers, provenance flag
```

**Structure Decision**: Single-package modification within the existing
`packages/mcp-server`. No new directories or packages. Tests co-located per
constitution (Process). The retrieval and observability packages are consumed
unchanged.

## Complexity Tracking

> No constitution violations. Table intentionally empty.

## Phase 0 — Research

See [research.md](./research.md). All Technical Context items are known; the only
open design questions were resolved in the spec's Clarifications session
(exact-join fallback, tiered disambiguation, distinct provenance flag). Research
confirms the injection point and that no engine/store change is required.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — logical entities (repo config entry, request,
  response metadata) and the resolution decision table.
- [contracts/get-file.tool.md](./contracts/get-file.tool.md) — the `get_file`
  response contract: unchanged input schema; new `structuredContent` fields and
  the four response shapes (single, grouped, candidate-list, not-found).
- [quickstart.md](./quickstart.md) — how to reproduce the bug and verify the fix.

**Agent context update**: `AGENTS.md` SPECKIT marker re-pointed to this plan.

**Post-Design Constitution Re-Check**: PASS. Design introduces no new abstraction
beyond a single injected function; TDD order preserved; response remains
structured (VII). No deviations to record.
