---
description: "Task list for Configurable Agent Docs Injection Targets"
---

# Tasks: Configurable Agent Docs Injection Targets

**Input**: Design documents from `/specs/014-agents-inject-target/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — the constitution (Principle I: TDD, Non-Negotiable) requires tests before implementation. Vitest is the sole framework; test files are co-located as `*.test.ts`.

**Organization**: Tasks are grouped by user story (US1–US4) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Exact file paths included in each task.

## Path Conventions

pnpm monorepo. Config model in `packages/core`; injection command in `packages/cli`; installer glue in root `install.sh` + `scripts/`. Tests co-located as `*.test.ts` beside source.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the working environment; no scaffolding needed (files already exist).

- [X] T001 Verify baseline is green: run `pnpm --filter @ia-framework/core test` and `pnpm --filter @ia-framework/cli test` from repo root and confirm existing `schema.test.ts`, `registry.test.ts`, `loader.test.ts`, `agents.command.test.ts` pass before changes.
- [X] T002 [P] Confirm lint/format config unchanged: run `pnpm lint` (ESLint 9 flat config) to establish a clean baseline in `packages/core` and `packages/cli`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the shared config model (`RepoEntry` type + Zod schema) that US1, US3, and US4 all build on. This is the only cross-story shared change.

**⚠️ CRITICAL**: No user story implementation can begin until this phase is complete.

- [X] T003 Add optional `injectAgents?: boolean | undefined` field to the `RepoEntry` interface in `packages/core/src/types/index.ts` with a doc comment (default false; absent → false).
- [X] T004 Extend `RepoEntrySchema` in `packages/core/src/config/schema.ts` to add `injectAgents: z.boolean().optional()` (keep all existing fields and `ProjectConfigSchema.refine` intact).
- [X] T004a Add optional top-level `agentInjectionTargets: z.array(z.string().min(1)).optional()` to `ProjectConfigSchema` in `packages/core/src/config/schema.ts` (injection-only, non-indexed paths for US5), and mirror it on the `ProjectConfig` type in `packages/core/src/types/index.ts`.

**Checkpoint**: The `injectAgents` field exists in the type and schema; user stories can now proceed.

---

## Phase 3: User Story 1 - Choose which repos receive agent instructions (Priority: P1) 🎯 MVP

**Goal**: Let the user designate injection targets via `injectAgents: true` in `repos[]`; the inject command touches only designated repos and refreshes existing blocks idempotently.

**Independent Test**: Configure a `project.json` with three repos, flag two, run `ia-framework agents inject`, and confirm only the two flagged repos' agent docs are created/updated and the third is untouched; re-run and confirm no duplication.

### Tests for User Story 1 (write first, ensure they FAIL)

- [X] T005 [P] [US1] Add schema tests in `packages/core/src/config/schema.test.ts`: `injectAgents` accepted as boolean, optional (config valid without it), and rejected when non-boolean (FR-001, FR-001a, FR-009).
- [X] T006 [P] [US1] Add registry tests in `packages/core/src/config/registry.test.ts` for a new `getInjectionTargets()`: returns only entries with `injectAgents === true` (some), returns all when all flagged, returns empty when none flagged; and de-dupes targets that resolve to the same absolute path (FR-002, FR-003, FR-005; edge: duplicate path).
- [X] T007 [P] [US1] Add registry test in `packages/core/src/config/registry.test.ts` asserting `toJSON()` preserves `injectAgents` when defined and omits it when undefined (D-03 regression guard).
- [X] T008 [P] [US1] Add CLI tests in `packages/cli/src/commands/agents.command.test.ts`: inject into multiple flagged targets (only those files written); re-inject refreshes in place without duplicating the marker block (FR-002, FR-006); non-flagged repo file not created (FR-003).

### Implementation for User Story 1

- [X] T009 [US1] Implement `RepoRegistry.getInjectionTargets(): RepoEntry[]` in `packages/core/src/config/registry.ts` — filter `repos[]` by `injectAgents === true`, de-dupe by resolved absolute `path` (make T006 pass).
- [X] T010 [US1] Update `RepoRegistry.toJSON()` in `packages/core/src/config/registry.ts` to include `injectAgents` via conditional spread when defined (make T007 pass).
- [X] T011 [US1] Refactor the `inject` subcommand in `packages/cli/src/commands/agents.command.ts` to resolve targets via `loadConfig` → `RepoRegistry.fromConfig` → `getInjectionTargets()`, then iterate targets, auto-detect the agent doc file per target (existing `AGENTS.md` → `CLAUDE.md` → create `AGENTS.md`), and call the existing `injectIntoFile()` for each; preserve the `--file` and `--config` overrides (`--file` forces a single explicit target) (make T008 pass; FR-002, FR-006, FR-007).

**Checkpoint**: User Story 1 fully functional — designated repos injected/refreshed idempotently, others untouched. MVP deliverable.

---

## Phase 4: User Story 4 - Injected guidance covers Context7 and Sequential Thinking (Priority: P2)

**Goal**: The injected marker block also documents when/how to use Context7 and Sequential Thinking, alongside the existing RAG tools guidance, refreshed as one unit.

**Independent Test**: Run inject into a designated target and confirm the resulting agent doc contains an identifiable Context7 section and a Sequential Thinking section inside the single `ia-framework:rag-start/end` block; re-run over an old block lacking them and confirm exactly one block now contains all three areas.

### Tests for User Story 4 (write first, ensure they FAIL)

- [X] T012 [P] [US4] Add CLI content tests in `packages/cli/src/commands/agents.command.test.ts`: injected content contains a Context7 guidance section (when to use / not use) and a Sequential Thinking guidance section (when to use / not use), in addition to the existing 3-tool RAG guidance (FR-013, FR-014, SC-007).
- [X] T013 [P] [US4] Add CLI idempotency test in `packages/cli/src/commands/agents.command.test.ts`: injecting over a file whose block lacks the new sections yields exactly one marker block containing all three guidance areas, no duplication (FR-015, SC-008).

### Implementation for User Story 4

- [X] T014 [US4] Extend the `RAG_CONTENT` string in `packages/cli/src/commands/agents.command.ts` with a "When to use Context7" subsection and a "When to use Sequential Thinking" subsection (self-contained per FR-016), keeping them inside the existing `RAG_MARKER_START`/`RAG_MARKER_END` block so refresh replaces all together (make T012, T013 pass).

**Checkpoint**: US1 + US4 work together — designated targets receive the full extended guidance, refreshed idempotently.

---

## Phase 5: User Story 2 - Safe default when no target is selected (Priority: P2)

**Goal**: When no repo is flagged, the CLI injects nowhere and reports it; the installer offers a fallback multi-select, persists chosen flags, then injects.

**Independent Test**: (a) `project.json` with repos but none flagged → `ia-framework agents inject` modifies no files and prints a clear no-target message. (b) Run `install.sh` with none flagged → prompted to pick targets; selecting some writes `injectAgents: true` back and injects; selecting none skips injection and completes cleanly.

### Tests for User Story 2 (write first, ensure they FAIL)

- [X] T015 [P] [US2] Add CLI tests in `packages/cli/src/commands/agents.command.test.ts`: with zero flagged repos, `inject` writes no files and prints a "no injection target configured" message and exits 0 (FR-004, FR-010a).
- [X] T016 [P] [US2] Add CLI test in `packages/cli/src/commands/agents.command.test.ts` asserting the `inject`/`check` subcommands never call an interactive prompt path (non-interactive contract, FR-010a).

### Implementation for User Story 2

- [X] T017 [US2] In the `inject` subcommand of `packages/cli/src/commands/agents.command.ts`, handle the zero-target case: print the no-target message and return without writing any file (make T015 pass; FR-004).
- [X] T018 [US2] Add installer fallback in `install.sh` Step 6.5: when the config is `repos[]` form with zero `injectAgents: true`, call `prompt_toggle_select` (from `scripts/installer-helpers.sh`) to let the user pick repos; if the config is legacy or already has flags, skip the prompt (FR-010).
- [X] T019 [US2] Persist selected flags back to `project.json`: implement the write-back in `install.sh` (or a small helper in `scripts/`) that sets `injectAgents: true` on the chosen repo entries before invoking `ia-framework agents inject`; if the user selects none, skip injection and print how to enable later (US2 scenario 2).

**Checkpoint**: US1 + US2 + US4 — no-target path is safe and reported; installer guides first-time selection.

---

## Phase 6: User Story 3 - Backward compatibility with existing configs (Priority: P3)

**Goal**: Legacy `targetProjectPath` configs (and `repos[]` entries lacking the flag) keep working; the legacy single target is implicitly opted-in.

**Independent Test**: Load a legacy `project.json` (`targetProjectPath`, no `repos[]`), run inject, and confirm it injects into that single target as before with no validation error.

### Tests for User Story 3 (write first, ensure they FAIL)

- [X] T020 [P] [US3] Add registry test in `packages/core/src/config/registry.test.ts`: for a legacy `targetProjectPath` config, `getInjectionTargets()` returns the single synthesized entry (implicitly opted-in) (FR-008).
- [X] T021 [P] [US3] Add loader/schema test in `packages/core/src/config/loader.test.ts` (or `schema.test.ts`): a `repos[]` config without any `injectAgents` field loads without validation error (FR-008).
- [X] T022 [P] [US3] Add CLI test in `packages/cli/src/commands/agents.command.test.ts`: with a legacy `targetProjectPath` config, `inject` targets the single legacy location as before (FR-008).

### Implementation for User Story 3

- [X] T023 [US3] In `RepoRegistry.getInjectionTargets()` (`packages/core/src/config/registry.ts`), detect the legacy-derived single-entry case and return it as implicitly opted-in (make T020, T022 pass; keep opt-in default-false rule scoped to `repos[]`).

**Checkpoint**: All four user stories independently functional; legacy installs unaffected.

---

## Phase 6b: User Story 5 - Inject into a non-indexed folder/target (Priority: P2)

**Goal**: Support injecting into arbitrary paths listed in top-level `agentInjectionTargets` that are not part of `repos[]` and are never indexed.

**Independent Test**: Configure `agentInjectionTargets: ["../ops-runbooks"]` (not in `repos[]`), run inject, and confirm the guidance is written there while no indexed repo is modified and no indexing is triggered for that path.

### Tests for User Story 5 (write first, ensure they FAIL)

- [X] T023a [P] [US5] Add schema test in `packages/core/src/config/schema.test.ts`: `agentInjectionTargets` accepted as optional `string[]`; config valid without it; rejected when not an array of strings (FR-017, FR-009).
- [X] T023b [P] [US5] Add registry/resolver test in `packages/core/src/config/registry.test.ts`: injection target resolution unions flagged `repos[]` with `agentInjectionTargets` (resolved relative to config dir), de-dupes by absolute path, and marks extra targets as non-indexed (FR-017, FR-018).
- [X] T023c [P] [US5] Add CLI test in `packages/cli/src/commands/agents.command.test.ts`: with an `agentInjectionTargets` path outside `repos[]`, `inject` writes the guidance there and does not touch indexed repos; a non-indexed missing path is reported per FR-012 (FR-017, FR-018).

### Implementation for User Story 5

- [X] T023d [US5] Extend the injection-target resolver in `packages/core/src/config/registry.ts` (`getInjectionTargets()` or a sibling method) to append `agentInjectionTargets` entries (resolve relative to config dir, tag as non-indexed, de-dupe by path) (make T023b pass).
- [X] T023e [US5] In the `inject` subcommand of `packages/cli/src/commands/agents.command.ts`, include the resolved non-indexed targets in the iteration and per-target summary; ensure no indexing path is invoked for them (make T023c pass; FR-017, FR-018).

**Checkpoint**: Guidance can be injected into indexed flagged repos and arbitrary non-indexed targets in one run.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Reporting, validation messaging, and docs across stories.

- [X] T024 [US1] Add a per-target result summary (`injected`/`refreshed`/`created`/`skipped`/`failed`) to the `inject` subcommand output in `packages/cli/src/commands/agents.command.ts`, and add a CLI test in `packages/cli/src/commands/agents.command.test.ts` asserting the summary lines/counts (FR-011).
- [X] T025 [US1] Add continue-on-error handling for missing/inaccessible target paths in `packages/cli/src/commands/agents.command.ts` (record `failed`, keep processing remaining targets), with a CLI test covering one failing + one succeeding target (FR-012; edge: inaccessible path).
- [X] T026 [P] Ensure clear, actionable Zod validation errors surface through `loadConfig` for a malformed `injectAgents` (non-boolean); add/adjust assertion in `packages/core/src/config/loader.test.ts` (FR-009).
- [X] T027 [P] Update `agents check` in `packages/cli/src/commands/agents.command.ts` to report presence across all injection targets (per-target found/not-found), with a test in `packages/cli/src/commands/agents.command.test.ts`.
- [X] T028 [P] Run the `quickstart.md` verification flow end-to-end (schema → registry → CLI → `pnpm test && pnpm build`) and fix any gaps.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2, T003–T004)**: Depends on Setup — BLOCKS all user stories (shared `RepoEntry`/schema change).
- **User Stories (Phases 3–6)**: All depend on Foundational.
- **Polish (Phase 7)**: Depends on the stories it extends (mainly US1/US2).

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational. MVP.
- **US4 (P2)**: Depends on Foundational; independently testable. Content-only change to `RAG_CONTENT` — no dependency on US1 logic, but shares `agents.command.ts`.
- **US2 (P2)**: Depends on Foundational + the `inject` target-resolution introduced in US1 (T011) for the zero-target branch (T017). Installer tasks (T018–T019) are independent of US1 code.
- **US3 (P3)**: Depends on Foundational + `getInjectionTargets()` (T009) which it extends for the legacy branch (T023).

### Shared-file sequencing (avoid conflicts)

- `packages/core/src/config/registry.ts`: T009 → T010 → T023 (same file; sequential).
- `packages/cli/src/commands/agents.command.ts`: T011 → T014 → T017 → T024 → T025 → T027 (same file; sequential). US4 content (T014) may be done before/after T011 but not concurrently.
- `agents.command.test.ts`: test-authoring tasks T008/T012/T013/T015/T016/T022 touch the same test file — author sequentially or in one editing pass.

### Within Each User Story

- Tests written first and FAIL before implementation (constitution TDD).
- Core (types/schema) before registry; registry before CLI; CLI before installer.

### Parallel Opportunities

- T001/T002 (Setup) parallel.
- Test-writing tasks that touch **different** files are parallel: e.g. T005 (schema.test.ts) ∥ T006/T007 (registry.test.ts) ∥ T008 (agents.command.test.ts).
- T020 (registry.test.ts) ∥ T021 (loader.test.ts) ∥ T022 (agents.command.test.ts).
- Polish T026 (loader.test.ts) ∥ T027 (agents.command.ts) ∥ T028 (quickstart) where files differ.
- Cross-story: once Foundational is done, US1 (core+CLI) and US2's installer tasks (T018–T019, bash) can progress in parallel with different developers.

---

## Parallel Example: User Story 1

```bash
# Author failing tests in parallel (different files):
Task: "Schema tests for injectAgents in packages/core/src/config/schema.test.ts"   # T005
Task: "getInjectionTargets tests in packages/core/src/config/registry.test.ts"      # T006 (+T007)
Task: "Multi-target inject tests in packages/cli/src/commands/agents.command.test.ts" # T008

# Then implement (registry before CLI; same-file tasks sequential):
Task: "getInjectionTargets() in registry.ts"   # T009
Task: "toJSON() preserves injectAgents"          # T010 (after T009, same file)
Task: "Iterate targets in agents.command.ts"     # T011 (after tests fail)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → 2. Phase 2 Foundational (T003–T004) → 3. Phase 3 US1 (T005–T011).
4. **STOP and VALIDATE**: flag two of three repos, run inject, confirm selective + idempotent behavior.
5. Ship MVP.

### Incremental Delivery

1. Foundation ready (Phase 2).
2. US1 → test → ship (MVP: selective targeting).
3. US4 → test → ship (richer injected guidance).
4. US2 → test → ship (safe no-target + installer fallback).
5. US3 → test → ship (legacy compatibility guaranteed).
6. Polish (reporting, failure handling, `check`, quickstart).

### Parallel Team Strategy

After Foundational: Dev A on US1 (core+CLI), Dev B on US4 content + US2 installer bash (different files), converging on `agents.command.ts` sequentially per the shared-file sequencing above.

---

## Notes

- [P] = different files, no dependencies. Same-file tasks are sequential (see shared-file sequencing).
- [Story] labels map tasks to spec user stories for traceability.
- Verify each test FAILS before implementing (TDD, Principle I).
- Commit after each task or logical group; run `pnpm test && pnpm build` before merge (Quality Gate).
- No new runtime dependencies; reuse `injectIntoFile()` idempotency and `prompt_toggle_select` (Principle V: Simplicity).
