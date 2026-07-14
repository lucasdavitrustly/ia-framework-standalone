# Feature Specification: TLC Spec-Driven Slash Commands

**Feature Branch**: `018-tlc-spec-driven-commands`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "The tlc-spec-driven is one of that ia-framework installs, but it not has commands (slash commands) to trigger it actions. We need to encapsulate it, the phases and all actions in commands. Also everytime we intiate a new spec it should created a branch."

## Overview

The `tlc-spec-driven` skill is ia-framework's default spec-driven-development (SDD) workflow installed into non-SpecKit IDEs. Today it can only be triggered through natural-language phrases ("specify feature", "map codebase", etc.). This feature packages the skill's phases and key actions as first-class slash commands delivered through the existing skill installer, and makes initiating a new spec — a feature **or** a quick task — automatically create a git branch. On IDEs that do not support slash commands, installation still succeeds and the skill remains fully usable via natural language.

Branch creation is self-contained within the skill: it does not depend on SpecKit or the project's `.specify/` tooling, so it works in any git repository regardless of whether SpecKit is installed.

## Clarifications

### Session 2026-07-13

- Q: What naming convention should the TLC slash commands use? → A: Hyphenated `tlc-<action>` (e.g. `tlc-specify`, `tlc-design`, `tlc-quick`).
- Q: Should commands be a single shared file per action or per-IDE variants? → A: Single shared command file per action, linked into each command-capable IDE.
- Q: What should a newly created spec/quick-task branch be based on? → A: The current HEAD (wherever the user currently is).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trigger a phase by command (Priority: P1)

A developer invokes a TLC phase directly through a slash command (for example, a "specify" command with a feature description) instead of relying on a natural-language trigger. The skill runs the corresponding phase against the supplied input.

**Why this priority**: This is the core value of the feature — turning the skill's phases into discoverable, invokable commands. Without it, nothing else in the feature has a reason to exist.

**Independent Test**: On a command-capable IDE, invoke the specify command with a one-line feature description and confirm the Specify phase runs and produces a specification, matching the behavior of the equivalent natural-language trigger.

**Acceptance Scenarios**:

1. **Given** the skill is installed on a command-capable IDE, **When** the developer invokes the specify command with a feature description, **Then** the Specify phase executes and produces the same output it would from the natural-language trigger.
2. **Given** the skill is installed, **When** the developer invokes the design, tasks, or execute command, **Then** the corresponding phase runs.

---

### User Story 2 - New feature spec creates a branch (Priority: P1)

When a developer initiates a new feature specification through the specify command, a git branch is created and checked out automatically before the specification is written, using sequential numbering consistent with existing specs.

**Why this priority**: Explicitly requested ("everytime we initiate a new spec it should create a branch"). It protects the main branch and keeps each spec's work isolated from the first action.

**Independent Test**: On a clean git repo, invoke the specify command for a new feature and confirm a new branch named `NNN-<short-name>` exists and is checked out, and that the spec artifacts use the same `NNN`.

**Acceptance Scenarios**:

1. **Given** a git repository, **When** the developer initiates a new feature spec, **Then** a branch named `NNN-<short-name>` is created and checked out before the spec is written.
2. **Given** the branch to be created already exists, **When** the developer initiates the spec, **Then** the skill switches to the existing branch without overwriting or resetting it.
3. **Given** existing specs numbered up to `N`, **When** a new spec is initiated, **Then** the new number is `N+1` with no collision.

---

### User Story 3 - Quick task creates a branch (Priority: P1)

When a developer starts a quick task through the quick-mode command, a git branch is created and checked out before implementation begins.

**Why this priority**: The user explicitly chose to extend branch-on-initiation to quick mode. This changes the current quick-mode flow (which commits but does not branch), so it must be a first-class, tested behavior.

**Independent Test**: Invoke the quick-mode command with a one-sentence task and confirm a dedicated branch is created and checked out before any file is changed, and the quick-task record is created.

**Acceptance Scenarios**:

1. **Given** a git repository, **When** the developer starts a quick task, **Then** a branch is created and checked out before implementation.
2. **Given** the quick task is initiated, **When** the branch is created, **Then** a quick-task record is created under the skill's quick-task location using the same number as the branch.

---

### User Story 4 - Project and state actions by command (Priority: P2)

A developer invokes the skill's high-value project and memory actions as commands: project initialization, roadmap creation, codebase mapping, recording state (decision/blocker/todo), and pausing/resuming a session.

**Why this priority**: These actions are central to the workflow but are used less frequently than the core phases. Exposing them as commands improves discoverability without being on the critical path of a single feature.

**Independent Test**: Invoke each project/state command and confirm it triggers the matching skill behavior (produces or updates the expected project/state artifacts).

**Acceptance Scenarios**:

1. **Given** the skill is installed, **When** the developer invokes the project-init, roadmap, or map-codebase command, **Then** the matching skill behavior runs.
2. **Given** an active project, **When** the developer invokes the record-state or session command, **Then** the persistent memory or session handoff behavior runs.

---

### User Story 5 - Graceful degradation on command-less IDEs (Priority: P1)

A developer installs the skill on an IDE that does not support slash commands. Installation succeeds without commands, and the skill remains fully usable through natural-language triggers.

**Why this priority**: The majority of supported IDEs do not support slash commands. If installation broke or the skill became unusable on those IDEs, the feature would be a regression for most users.

**Independent Test**: Install the skill targeting a command-less IDE and confirm there is no installation error, the skill is available, and natural-language triggers still route to the correct phases/actions.

**Acceptance Scenarios**:

1. **Given** a target IDE without slash-command support, **When** the skill is installed, **Then** installation completes with zero errors and no commands are linked.
2. **Given** the skill is installed on a command-less IDE, **When** the developer uses a natural-language trigger, **Then** the corresponding phase/action runs as before.

---

### User Story 6 - Command discoverability (Priority: P2)

A developer browses their IDE's command palette and can identify and run TLC commands from their names, descriptions, and argument hints.

**Why this priority**: Discoverability is the practical payoff of having commands, but the commands are still functional without perfect palette metadata, so it ranks below core execution.

**Independent Test**: Open the command palette on a command-capable IDE and confirm each TLC command shows a description and an argument hint sufficient to run it without consulting documentation.

**Acceptance Scenarios**:

1. **Given** the skill is installed on a command-capable IDE, **When** the developer opens the command palette, **Then** each TLC command displays a description and an argument hint.

---

### Edge Cases

- What happens when the repository has no git history yet (no commits)? Branch creation must still succeed or degrade with a clear message rather than failing silently.
- What happens when the target branch name already exists locally or remotely? The skill switches to it instead of overwriting or resetting.
- What happens when spec numbers exist in the skill's feature location, its quick-task location, and existing branches simultaneously? Numbering must consider all sources so the chosen number never collides.
- What happens when a command is invoked with an empty argument (no description)? The command must prompt for the missing input rather than producing an empty spec/task.
- What happens when the working directory is not a git repository? Branch creation must report a clear, actionable message.
- What happens on a command-less IDE when a user expects a command? Documentation must make clear that natural-language triggers are the entry point there.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The skill MUST provide slash commands covering the four phases: Specify, Design, Tasks, and Execute.
- **FR-002**: The skill MUST provide a slash command for Quick mode.
- **FR-003**: The skill MUST provide slash commands for the key project and state actions: project initialization, roadmap creation, codebase mapping, recording state (decision/blocker/todo), and session pause/resume.
- **FR-004**: Each command MUST map to the skill's corresponding phase or action so that the command path and the natural-language path remain behaviorally equivalent.
- **FR-005**: Initiating a new feature specification MUST create and check out a git branch before the specification is written.
- **FR-006**: Initiating a new quick task MUST create and check out a git branch before implementation begins.
- **FR-017**: New branches (for feature specs and quick tasks) MUST be created from the current HEAD; the skill MUST NOT assume or switch to a default/main branch first.
- **FR-007**: Branch creation MUST be provided by the skill's own logic and MUST NOT depend on SpecKit or the project's `.specify/` tooling; it MUST function in any git repository.
- **FR-008**: The skill MUST derive sequential spec numbering from its own sources of truth (its feature and quick-task locations plus existing git branches), producing branch names of the form `NNN-<short-name>`.
- **FR-009**: Commands MUST be delivered so that the existing skill installer detects and links them into every target IDE that supports slash commands.
- **FR-016**: Each command action MUST be defined by a single shared command file (one file per action), which the installer links into every command-capable IDE; per-IDE command variants MUST NOT be required.
- **FR-010**: On target IDEs that do not support slash commands, installation MUST complete successfully with zero errors, no commands linked, and the skill MUST remain fully usable via natural-language triggers.
- **FR-011**: Each command MUST carry a description and an argument hint for command-palette discoverability.
- **FR-015**: Commands MUST be named using the hyphenated convention `tlc-<action>` (for example, `tlc-specify`, `tlc-design`, `tlc-tasks`, `tlc-execute`, `tlc-quick`) so that all TLC commands share a consistent, recognizable prefix.
- **FR-012**: Branch creation MUST NOT overwrite or reset an existing branch; when the target branch already exists, the skill MUST switch to it.
- **FR-013**: The skill's documentation (its main definition and affected reference material) MUST be updated to describe the new command entry points and the new "branch on new spec and quick task" behavior.
- **FR-014**: When a command is invoked without the required input (for example, no feature description), the skill MUST prompt for the missing input rather than producing an empty artifact.

### Key Entities *(include if feature involves data)*

- **TLC Command**: A named, invokable entry point mapped to a skill phase or action. Attributes: name, description, argument hint, the phase/action it triggers.
- **Feature Spec**: A numbered specification for a feature, associated with a dedicated git branch and a spec artifact location.
- **Quick Task**: A numbered ad-hoc task, associated with a dedicated git branch and a quick-task record.
- **Target IDE**: An installation destination characterized by whether it supports slash commands.
- **Spec Number**: A sequential identifier shared by a spec/quick-task and its branch, computed to avoid collisions across all sources.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the four phases plus Quick mode are invokable as slash commands on command-capable IDEs.
- **SC-002**: Initiating a new feature spec or quick task results in a new, checked-out branch with no manual git steps in at least 95% of initiations.
- **SC-003**: Zero spec/branch numbering collisions occur across the skill's feature location, quick-task location, and existing branches.
- **SC-004**: Installing on a command-less IDE produces zero installation errors and preserves natural-language usage in 100% of cases.
- **SC-005**: A new user can discover and run a TLC command from the command palette without consulting documentation.
- **SC-006**: Branch creation succeeds without depending on any SpecKit/`.specify/` files in 100% of supported git repositories.

## Assumptions

- "Every new spec creates a branch" is interpreted to include quick-mode tasks as well as feature specs, per the user's explicit choice. This is a deliberate change to the current quick-mode flow, which commits but does not create a branch.
- Only IDEs that advertise slash-command support receive commands; the remaining supported IDEs degrade gracefully to natural-language triggers. This is expected behavior, not a defect.
- Branch numbering reuses the same sequential `NNN-<short-name>` convention already familiar from existing specs, but is reimplemented inside the skill so it carries no SpecKit dependency (per the user's Option B decision).
- Commands follow the standard command-file format the existing installer already recognizes, so no installer changes are required beyond the skill being marked as providing commands.
- The skill's own directories (feature and quick-task locations) are the authoritative source for numbering, alongside local and remote git branches.
- This specification governs exposing existing skill behavior via commands and adding branch automation; it does not change the internal logic of the phases themselves.

## Out of Scope

- Adding slash-command support to IDEs that do not have it.
- Replacing, merging with, or depending on the repository-local SpecKit command system or `.specify/` tooling.
- Reusing the SpecKit git-extension branch-creation script.
- Changing the internal logic of the Specify, Design, Tasks, Execute, or Quick-mode phases beyond wiring command entry points and branch creation.
