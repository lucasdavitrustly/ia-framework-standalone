---
description: "Task list for feature 017 — Resilient get_file repo resolution"
---

# Tasks: Resilient `get_file` Repo Resolution When Repo Is Unspecified

**Input**: Design documents from `/specs/017-fix-getfile-repo-resolution/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/get-file.tool.md, quickstart.md

**Tests**: INCLUDED — TDD is Non-Negotiable per Constitution Principle I. All test tasks are written first and must FAIL before implementation.

**Organization**: Grouped by user story (US1=P1, US2=P2 disambiguation, US3=P2 diagnostics). All work is confined to `packages/mcp-server`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3
- Exact file paths included

## Path Conventions

Single monorepo package. Source and co-located tests under:
`packages/mcp-server/src/` (tools in `tools/`). No new directories required.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm workspace state; no new deps or scaffolding needed (additive change to existing files).

- [X] T001 Verify baseline is green: run `pnpm --filter @ia-framework/mcp-server test` and `pnpm --filter @ia-framework/mcp-server build`; record current passing `get_file` tests to protect against regression (SC-006).
- [X] T002 Re-read the resolution decision table in `specs/017-fix-getfile-repo-resolution/data-model.md` and the response shapes in `specs/017-fix-getfile-repo-resolution/contracts/get-file.tool.md` to lock the target behavior before editing code.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Introduce the shared repo-enumeration capability that all three stories depend on. Per research.md Decision 2, get-file.ts must not gain `node:fs`/path knowledge — the capability is injected from `server.ts`.

**⚠️ CRITICAL**: No user story implementation can begin until T005 is complete.

- [X] T003 Define shared internal types for cross-repo resolution in `packages/mcp-server/src/tools/get-file.ts`: add `RepoResolution` (`repo`, `found`, `content?`, `skipped`, `error?`) and extend `GetFileOptions` with an injected `resolveFileAcrossRepos?` capability and a configurable `disambiguationThreshold?` (default 3, per FR-012), and extend the response `structuredContent` typing to allow `resolvedVia`, `candidates`, `reposSearched` (per data-model.md).
- [X] T004 [P] Write FAILING test in `packages/mcp-server/src/server.test.ts` asserting `createMcpServer` builds a `resolveFileAcrossRepos` capability that: enumerates configured repos in configuration order, performs an exact-join read per repo, skips repos marked inaccessible by `validateRepoPaths` (reporting `skipped`/`error`, FR-007), and performs no recursive scan (FR-011).
- [X] T005 Implement the `resolveFileAcrossRepos` closure in `packages/mcp-server/src/server.ts`, reusing `repoPathMap`, `resolveRoot`, `assertAccessible`, and `repoAccessibility`; wire it (plus the `disambiguationThreshold`) into the `registerGetFileTool` options alongside the existing `readFileFn`/`statFn`. Make T004 pass.

**Checkpoint**: Handler can enumerate repos via injection; stories can proceed.

---

## Phase 3: User Story 1 - Retrieve a file without knowing its repo (Priority: P1) 🎯 MVP

**Goal**: When no `repo:` prefix is given and the index yields no chunk, resolve the file via exact-join existence check across repos and return the single match with `resolvedVia: "filesystem-fallback"`.

**Independent Test**: Configure ≥2 repos, place the target file under exactly one, call `get_file` with the bare relative path; live content is returned from the correct repo (quickstart.md P1).

### Tests for User Story 1 (write first, must FAIL) ⚠️

- [X] T006 [P] [US1] Add FAILING test in `packages/mcp-server/src/tools/get-file.test.ts`: empty `engine.getFile` + file present on disk in exactly one repo (via mocked `resolveFileAcrossRepos`) → returns file content and `structuredContent.resolvedVia === "filesystem-fallback"` (FR-001, FR-003, SC-001).
- [X] T007 [P] [US1] Add FAILING test in `packages/mcp-server/src/tools/get-file.test.ts`: valid `repo:` prefix + index hit still returns content with `resolvedVia: "index"` and NO `fallbackUsed` — proves existing behavior unchanged (FR-010, SC-006).
- [X] T008 [P] [US1] Add FAILING test in `packages/mcp-server/src/tools/get-file.test.ts`: `startLine`/`endLine` and `name` filters are honored on the fallback single-match path (FR-009).

### Implementation for User Story 1

- [X] T009 [US1] In `packages/mcp-server/src/tools/get-file.ts`, replace the premature "No indexed chunks found" return: when `results.length === 0`, no `repo` prefix, and `resolveFileAcrossRepos` is available, invoke it and branch on match count. Implement the SINGLE-match branch → return content, set `resolvedVia: "filesystem-fallback"`, do NOT set `fallbackUsed` (FR-002, FR-003, FR-008).
- [X] T010 [US1] In the same file, ensure the single-match fallback applies `input.name` and `input.startLine`/`input.endLine` consistently (reuse existing slice/name logic) and set `resolvedVia: "index"` on the existing index-hit paths so provenance is always explicit. Make T006–T008 pass.

**Checkpoint**: MVP — bare-path retrieval works for single-repo matches; existing behavior intact.

---

## Phase 4: User Story 2 - Disambiguate a path present in multiple repos (Priority: P2)

**Goal**: Tiered disambiguation by match count — ≤ threshold returns grouped copies; > threshold returns a content-free candidate list.

**Independent Test**: Same relative path under 2 repos → grouped; under > threshold repos → candidate list with no content (quickstart.md P2).

### Tests for User Story 2 (write first, must FAIL) ⚠️

- [X] T011 [P] [US2] Add FAILING test in `packages/mcp-server/src/tools/get-file.test.ts`: empty index + path found on disk in 2 repos → grouped `## [repo]` copies, `structuredContent.multiRepo === true`, `resolvedVia: "filesystem-fallback"`, retry-with-prefix guidance present (FR-004).
- [X] T012 [P] [US2] Add FAILING test in `packages/mcp-server/src/tools/get-file.test.ts`: path found on disk in more repos than the threshold → NO file content, `structuredContent.candidates` populated with `repo:path` options, retry instruction present (FR-004, SC-005).
- [X] T013 [P] [US2] Add FAILING test in `packages/mcp-server/src/tools/get-file.test.ts`: `disambiguationThreshold` is configurable — same match set yields grouped vs candidate-list depending on the injected threshold (FR-012).

### Implementation for User Story 2

- [X] T014 [US2] In `packages/mcp-server/src/tools/get-file.ts`, implement the 2..threshold branch of the fallback by reusing `buildMultiRepoFileResponse` shape over the on-disk matches (grouped, `multiRepo: true`, `resolvedVia: "filesystem-fallback"`), honoring filters per repo (FR-004, FR-009).
- [X] T015 [US2] In the same file, implement the > threshold branch: build a content-free candidate list (`candidates: ["<repo>:<path>", ...]`, `answered: false`) with a human-readable retry-with-prefix message; read `disambiguationThreshold` from options (default 3). Make T011–T013 pass.

**Checkpoint**: US1 + US2 both work; wide collisions stay token-cheap.

---

## Phase 5: User Story 3 - Actionable diagnostics when the file cannot be found (Priority: P2)

**Goal**: Zero on-disk matches (no prefix) → diagnostic listing repos searched, resolved path, likely causes, retry guidance; no silent empty response; provenance flags never conflated.

**Independent Test**: Call `get_file` with a nonexistent path → diagnostic with `reposSearched`, causes, retry guidance, no content (quickstart.md P3).

### Tests for User Story 3 (write first, must FAIL) ⚠️

- [X] T016 [P] [US3] Add FAILING test in `packages/mcp-server/src/tools/get-file.test.ts`: empty index + path found in zero repos → `structuredContent.reposSearched` populated, `answered: false`, no file content; text lists likely causes and retry-with-prefix guidance (FR-005, SC-003).
- [X] T017 [P] [US3] Add FAILING test in `packages/mcp-server/src/tools/get-file.test.ts`: unknown `repo:` prefix → explicit error naming configured repos, and `resolveFileAcrossRepos` / read is NOT invoked (FR-006).
- [X] T018 [P] [US3] Add FAILING test in `packages/mcp-server/src/tools/get-file.test.ts`: an inaccessible repo is excluded from reads but still named (with reason) in `reposSearched` diagnostic (FR-007); and assert `resolvedVia: "filesystem-fallback"` (success) is never set together with `fallbackUsed` (degraded) (FR-008, SC-004).

### Implementation for User Story 3

- [X] T019 [US3] In `packages/mcp-server/src/tools/get-file.ts`, implement the zero-match diagnostic branch: emit `reposSearched` (including skipped/inaccessible repos with reason), the resolved relative path, likely causes (path mismatch / moved-deleted / misconfigured root), and retry-with-prefix guidance; no content (FR-005, FR-007).
- [X] T020 [US3] Ensure the unknown-prefix path returns the FR-006 error before any resolution attempt, and audit that `resolvedVia` (success) and `fallbackUsed`/degraded (failure) are set on mutually exclusive paths so `withDegradation` merge never conflates them (FR-008). Make T016–T018 pass.

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T021 [P] Update the `get_file` tool `description` string in `packages/mcp-server/src/tools/get-file.ts` (registerGetFileTool) to note that a bare relative path is auto-resolved across configured repos and that a `repo:` prefix disambiguates.
- [X] T022 Run `specs/017-fix-getfile-repo-resolution/quickstart.md` end-to-end (bug reproduction + P1/P2/P3 + regression) against a local multi-repo config; confirm each expected response shape. — NOTE: validated via automated tests in `get-file.test.ts` (every quickstart response shape — single fallback, grouped, candidate-list, not-found, index-hit regression, unknown-prefix — has a dedicated assertion); no live multi-repo config was provisioned in this environment.
- [X] T023 Run full gates: `pnpm test && pnpm build`; confirm all new tests pass and every pre-existing `get_file`/server test remains green (SC-006). Fix lint/format (`pnpm lint`, Prettier) as needed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after Setup; **blocks all stories** (T005 provides the injected capability the handler branches on).
- **User Stories (Phase 3–5)**: all depend on Phase 2 (T005 + the shared types in T003).
- **Polish (Phase 6)**: after all desired stories complete.

### User Story Dependencies

- **US1 (P1)**: after Foundational. No dependency on US2/US3. Independently testable (MVP).
- **US2 (P2)**: after Foundational. Reuses `buildMultiRepoFileResponse`; logically extends the fallback branch introduced in US1 (T009) — sequence US1 before US2 to avoid editing the same branch simultaneously.
- **US3 (P2)**: after Foundational. Independent of US2. Touches the same file as US1/US2 (`get-file.ts`), so serialize file edits.

### Within Each User Story

- Tests (T006–T008, T011–T013, T016–T018) written and FAILING before implementation.
- Implementation makes the story's tests green before moving on.

### File-contention note

`packages/mcp-server/src/tools/get-file.ts` is edited by T003, T009, T010, T014, T015, T019, T020, T021. These implementation tasks are **not** parallel with each other despite touching one file — serialize them. Only the `[P]` **test** tasks (separate additions to the test file, independent cases) and T004/T021 are safe to parallelize as marked.

## Parallel Opportunities

- Phase 2: T004 (server.test.ts) is `[P]` relative to T003 (get-file.ts types).
- Within each story, the `[P]` test tasks add independent cases and can be authored together:
  - US1: T006, T007, T008
  - US2: T011, T012, T013
  - US3: T016, T017, T018

## Parallel Example: User Story 1

```bash
# Author the three failing US1 tests together (independent cases in get-file.test.ts):
Task: "T006 fallback single-match returns content + resolvedVia filesystem-fallback"
Task: "T007 valid prefix + index hit unchanged (resolvedVia index)"
Task: "T008 startLine/endLine + name filters honored on fallback"
# Then implement T009 → T010 sequentially (same file).
```

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (T003–T005) → 3. Phase 3 US1 (T006–T010) → 4. STOP and validate quickstart P1 → the reported bug is fixed at this point.

### Incremental Delivery

1. Foundational ready → 2. US1 (MVP, bug fixed) → 3. US2 (token-efficient disambiguation) → 4. US3 (diagnostics) → 5. Polish. Each story keeps prior behavior green.

## Notes

- [P] = different files / independent test cases, no dependencies.
- TDD enforced: verify each test fails before implementing (Constitution I).
- Commit after each task or logical group (Constitution: Process).
- Change is additive and confined to `packages/mcp-server`; no engine/store/indexing edits.
