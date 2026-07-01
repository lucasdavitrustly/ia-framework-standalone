# Feature Specification: Configurable Agent Docs Injection Targets

**Feature Branch**: `014-agents-inject-target`

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "The install.sh injects the AGENTS.md in every repo listed, but it should be choosen by the user. How the project.json could enable it? We should point wich repo/target to inject the agents instructions"

## Clarifications

### Session 2026-07-01

- Q: How should the user designate an injection target in `project.json`? → A: A per-repo boolean flag on each repo entry (e.g. `injectAgents`), defaulting to `false`; if the flag is absent or unavailable, it falls back to `false` (opt-in only).
- Q: For a legacy `project.json` (`targetProjectPath`, no `repos[]`), what should injection do? → A: Inject into the single legacy target as before (legacy target is implicitly opted-in; the default-`false` opt-in rule applies only to the new `repos[]` `injectAgents` flag).
- Q: During `install.sh` setup, how should injection targets get chosen? → A: Hybrid — non-interactive by default (honor existing `injectAgents` flags); when zero repos are flagged, prompt the user to optionally select targets and write the chosen flags back to `project.json`.
- Q: How are non-indexed injection targets expressed (US5)? → A: Via an optional top-level `agentInjectionTargets: string[]` array of paths in `project.json`, complementing the per-repo `injectAgents` flag. Entries are injection-only (never indexed) and are resolved relative to the config file directory. The full target set = flagged `repos[]` ∪ `agentInjectionTargets` (∪ the legacy `targetProjectPath` when that format is used).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose which repos receive agent instructions (Priority: P1)

As a user configuring `ia-framework` for a multi-repo project, I want to declare in `project.json` which repositories (targets) should receive the RAG/agent instructions injected into their agent documentation file (e.g. `AGENTS.md` / `CLAUDE.md`), so that the tool only modifies the projects I explicitly opt in — instead of implicitly picking a default target for me.

**Why this priority**: This is the core of the request. Without an explicit selection mechanism, the user has no control over which project files get modified, which risks unwanted edits to repositories they did not intend to touch. It is the minimum viable slice that delivers the requested value.

**Independent Test**: Configure a `project.json` with multiple repos, mark a subset as injection targets, run the setup/injection flow, and confirm the agent documentation file is created/updated only in the selected repositories and left untouched in the rest.

**Acceptance Scenarios**:

1. **Given** a `project.json` listing three repositories with two of them marked as injection targets, **When** the injection runs, **Then** the agent instructions appear only in the two selected repositories and the third is not modified.
2. **Given** a `project.json` where a single repository is marked as an injection target, **When** the injection runs, **Then** the agent instructions are injected into that repository's agent documentation file.
3. **Given** a repository marked as an injection target that already contains the agent instructions, **When** the injection runs again, **Then** the existing instructions are refreshed in place without duplicating the content.

---

### User Story 2 - Safe default when no target is selected (Priority: P2)

As a user who has not explicitly marked any injection target in `project.json`, I want the tool to behave predictably and safely — either injecting nowhere or clearly reporting that no target was selected — so that I am never surprised by silent edits to a project I did not choose.

**Why this priority**: Defines behavior for the "unconfigured" path and prevents the current implicit "first repo" default from silently modifying an unintended repository. Important for trust, but secondary to the ability to select targets.

**Independent Test**: Provide a `project.json` with repos but no injection targets marked, run the flow, and confirm the tool reports the no-target outcome and does not modify any repository.

**Acceptance Scenarios**:

1. **Given** a `project.json` with repositories but no injection target selected, **When** the injection runs, **Then** the tool reports that no injection target was configured and modifies no files.
2. **Given** no injection target is configured (zero repos flagged), **When** the user runs the installer, **Then** the installer prompts the user to optionally select injection targets and writes the chosen `injectAgents` flags back to `project.json`; if the user declines, the installer completes successfully, modifies no files, and points the user to how to enable injection later.

---

### User Story 3 - Backward compatibility with existing configs (Priority: P3)

As an existing user whose `project.json` uses the legacy single-target format, I want my current configuration to keep working after upgrading, so that the setup flow does not break for projects created before this feature.

**Why this priority**: Protects existing installations from breakage. Valuable but only relevant to users upgrading from a prior version.

**Independent Test**: Load a legacy-format `project.json` (single target, no explicit injection selection), run the flow, and confirm injection still targets the previously-expected location without error.

**Acceptance Scenarios**:

1. **Given** a legacy `project.json` with a single target and no injection selection field, **When** the injection runs, **Then** the tool injects into that single target as before, preserving prior behavior.
2. **Given** a legacy `project.json`, **When** the config is loaded, **Then** no validation error is raised for the absence of the new injection selection field.

---

### User Story 4 - Injected guidance covers Context7 and Sequential Thinking (Priority: P2)

As a developer working in a target project that received the ia-framework agent instructions, I want that injected guidance to also tell my AI agent when and how to use Context7 (for up-to-date library/framework documentation) and Sequential Thinking (for structured multi-step reasoning), so that agents in my project benefit from these tools — not only agents working inside the ia-framework repository.

**Why this priority**: The value of the injected instructions is realized in the target projects. Guidance that only lives in the ia-framework repo does not help downstream users. Extending the injected content to cover these tools makes the injection meaningfully more useful, but it is secondary to the core ability to select injection targets (Story 1).

**Independent Test**: Run the injection into a designated target and confirm the resulting agent documentation file contains guidance on when to use Context7 and when to use Sequential Thinking, in addition to the existing codebase RAG tools guidance.

**Acceptance Scenarios**:

1. **Given** a designated injection target, **When** the injection runs, **Then** the injected block includes a section describing when to use Context7 (library/framework/API documentation) and when to use Sequential Thinking (multi-step reasoning), alongside the existing RAG tools guidance.
2. **Given** a target that already contains a prior injected block without the Context7/Sequential Thinking guidance, **When** the injection runs again, **Then** the block is refreshed in place to include the new guidance without duplicating any content.
3. **Given** the injected guidance, **When** an agent reads it, **Then** it can determine from the text alone the situations where each tool is appropriate and where it is not.

---

### User Story 5 - Inject into a folder/target that is not indexed (Priority: P2)

As a user, I want to inject the agent instructions into a folder or repository that is **not** part of my indexed `repos[]` (for example a docs folder, an umbrella/monorepo root, or a sibling project I only want the guidance in), so that I can place the guidance wherever my agents actually run without being forced to index that location first.

**Why this priority**: The indexed set and the "where should agents read guidance" set are not always the same. Coupling injection strictly to indexed repos would block a legitimate, common need (e.g. a workspace root that aggregates several indexed sub-repos). It extends the core selection capability (Story 1) to arbitrary locations, so it ranks just below the core.

**Independent Test**: Configure a target location that is not present in `repos[]`, run injection against it, and confirm the agent documentation file is created/updated there without requiring that location to be indexed and without affecting the indexed repos.

**Acceptance Scenarios**:

1. **Given** a target folder/path that is not listed in `repos[]`, **When** the user designates it as an injection target and runs injection, **Then** the agent documentation file at that location is created/updated and no indexed repo is modified as a side effect.
2. **Given** an extra injection target that is not indexed, alongside indexed repos that are also flagged, **When** injection runs, **Then** both the indexed flagged repos and the extra non-indexed target receive the guidance.
3. **Given** a non-indexed injection target, **When** injection runs, **Then** the tool does not attempt to index it and raises no error about it being absent from `repos[]`.

### Edge Cases

- What happens when an injection target points to a path that does not exist or is not accessible? The tool should report the affected target and continue with the remaining valid targets rather than aborting the whole run.
- What happens when a selected target has neither an existing `AGENTS.md` nor `CLAUDE.md`? The tool should create the default agent documentation file in that target.
- What happens when a target has both `AGENTS.md` and `CLAUDE.md` present? The tool must apply a deterministic, documented precedence so the same file is chosen every run.
- What happens when the same physical repository is listed more than once as a target? The tool should inject only once per unique location to avoid duplicated edits.
- What happens when every listed repository is marked as a target? All listed repositories receive the injection (the user explicitly opted all of them in).
- What happens when a designated injection target is a folder/path outside the indexed `repos[]`? The tool injects the guidance there (creating the agent doc file if needed) without indexing it and without touching indexed repos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `project.json` configuration MUST allow the user to explicitly designate which repositories/targets receive injected agent instructions, via a per-repo boolean flag (e.g. `injectAgents`) on each repo entry.
- **FR-001a**: The injection-target flag MUST default to `false`; when the flag is absent, null, or otherwise unavailable on a repo entry, the system MUST treat that repo as NOT an injection target (opt-in only).
- **FR-002**: The injection process MUST only modify agent documentation files in the repositories/targets the user has explicitly designated.
- **FR-003**: The injection process MUST NOT modify any repository that has not been designated as an injection target.
- **FR-004**: When no repo entry has the injection-target flag set to `true`, the system MUST NOT silently inject into an implicitly-chosen repository; it MUST report that no target was configured and take no modifying action.
- **FR-005**: The system MUST support designating multiple repositories as injection targets in a single `project.json`.
- **FR-006**: When a designated target already contains previously-injected agent instructions, the system MUST refresh them in place without creating duplicate content.
- **FR-007**: For a designated target lacking an agent documentation file, the system MUST create the default agent documentation file following a documented file-name precedence.
- **FR-008**: The system MUST continue to support existing (legacy) `project.json` configurations that use `targetProjectPath` (no `repos[]`), injecting into that single legacy target as before. The legacy target is implicitly opted-in; the default-`false` opt-in rule applies only to the `repos[]` `injectAgents` flag.
- **FR-009**: The system MUST validate the injection-target configuration and produce a clear, actionable error when the designation is malformed (e.g. the flag or standalone-target value is the wrong type). Designating a location that is not present in `repos[]` is NOT an error (see FR-017).
- **FR-010**: The installer flow and the standalone injection command MUST both honor the user's designated injection targets (the `injectAgents` flags) consistently. The installer runs non-interactively when at least one repo is flagged; when zero repos are flagged, the installer MUST prompt the user to optionally select injection targets and persist the chosen flags to `project.json` before injecting.
- **FR-010a**: The standalone injection command MUST NOT prompt interactively; when zero repos are flagged it MUST follow FR-004 (report no target configured and take no modifying action).
- **FR-011**: The system MUST report a per-target outcome summary (injected, refreshed, created, skipped, or failed) so the user can confirm which repositories were affected.
- **FR-012**: When a designated target path is missing or inaccessible, the system MUST report that target as failed and continue processing the remaining designated targets.
- **FR-013**: The injected agent instructions MUST include guidance on when and how to use Context7 for obtaining up-to-date library, framework, SDK, API, and CLI documentation, so agents in the target project apply it appropriately.
- **FR-014**: The injected agent instructions MUST include guidance on when and how to use Sequential Thinking for structured, multi-step, and revisable reasoning, including when it is NOT appropriate.
- **FR-015**: The Context7 and Sequential Thinking guidance MUST be delivered as part of the same managed, marker-delimited injected block as the existing codebase RAG guidance, so that a refresh updates all guidance together without duplication.
- **FR-016**: The added guidance MUST be self-contained and understandable from the injected text alone, without requiring the reader to consult the ia-framework repository.
- **FR-017**: The system MUST allow the user to designate an injection target that is NOT part of the indexed `repos[]` (an arbitrary folder or repository path), and MUST inject into it without requiring that location to be indexed.
- **FR-018**: When injecting into a non-indexed target, the system MUST NOT attempt to index it, MUST NOT modify any indexed repository as a side effect, and MUST report its per-target outcome consistently with indexed targets (FR-011/FR-012).

### Key Entities *(include if feature involves data)*

- **Project Configuration (`project.json`)**: The user-editable configuration describing the project. Holds the list of repositories/targets and the user's designation of which of them are injection targets.
- **Repository/Target Entry**: A single configured location representing a project the tool can operate on. Carries a boolean injection-target flag (e.g. `injectAgents`, default `false`) marking whether it receives agent-instructions injection.
- **Extra Injection Target (non-indexed)**: A folder or repository path designated for injection that is NOT part of the indexed `repos[]`. Receives the guidance like any target but is never indexed.
- **Agent Documentation File**: The per-repository file (e.g. `AGENTS.md` or `CLAUDE.md`) into which agent instructions are injected, following a documented precedence when multiple candidates exist.
- **Injected Guidance Block**: The marker-delimited, tool-managed content written into a target's agent documentation file. Covers the codebase RAG tools and, per this feature, also Context7 and Sequential Thinking usage guidance; refreshed as a unit.
- **Injection Result**: The per-target outcome of an injection run (injected / refreshed / created / skipped / failed) surfaced to the user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can designate any subset (zero, one, some, or all) of their configured repositories as injection targets using `project.json` alone, without editing any other file.
- **SC-002**: After a run, 100% of designated targets contain the agent instructions and 0% of non-designated repositories are modified.
- **SC-003**: When no target is designated, 0 files are modified and the user receives an explicit message stating no target was configured.
- **SC-004**: Existing legacy configurations continue to work with no user edits and no errors in 100% of upgrade cases.
- **SC-005**: Re-running injection on an already-injected target produces exactly one copy of the instructions (no duplication) in 100% of runs.
- **SC-006**: After a run, the user can see a per-target result summary that correctly reflects which repositories were injected, created, skipped, or failed.
- **SC-007**: The injected guidance in every designated target includes a clearly identifiable Context7 section and a Sequential Thinking section in 100% of runs, in addition to the codebase RAG tools guidance.
- **SC-008**: Refreshing a previously-injected target that lacked the Context7/Sequential Thinking guidance results in exactly one managed block that now contains all three guidance areas, with no duplicated content, in 100% of runs.
- **SC-009**: A user can inject the guidance into at least one location that is not part of the indexed `repos[]`, in the same run as indexed targets, with 0 indexed repos modified as a side effect and no indexing triggered for the non-indexed location.

## Assumptions

- The existing multi-repo `project.json` format (a list of repository entries) is the mechanism the user wants extended, so the injection selection is expressed as a per-repository designation within that list.
- The injected agent instructions are the RAG/agent tools guidance produced by the tool; this feature governs *where* it is injected and additionally extends *what* guidance it contains to cover Context7 and Sequential Thinking (FR-013–FR-016).
- The file-name precedence for the agent documentation file (e.g. prefer an existing `AGENTS.md`, then `CLAUDE.md`, otherwise create `AGENTS.md`) mirrors the current behavior and is retained.
- Legacy single-target configurations should keep injecting into that single target to avoid breaking existing installations.
- The installer and the standalone injection command share the same target-selection logic (the `injectAgents` flags); they differ only in the installer's zero-flag fallback prompt (FR-010/FR-010a).
- "Choosing" targets is primarily a configuration-time decision expressed in `project.json` via the `injectAgents` flag. The installer adds a single fallback prompt only when zero repos are flagged (see FR-010); the standalone injection command remains fully non-interactive (FR-010a).
