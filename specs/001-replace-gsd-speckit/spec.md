# Feature Specification: Replace GSD with GitHub SpecKit

**Feature Branch**: `001-replace-gsd-speckit`

**Created**: 2026-06-01

**Status**: Draft

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Fresh Install with SpecKit (Priority: P1)

A developer clones ia-framework and runs `./install.sh`. The installer
detects whether GitHub SpecKit is already installed. If not, it asks the
user which version to install, downloads/installs it, and confirms success.
If SpecKit cannot be found or installed, it shows a message and skips
gracefully without blocking the rest of the installation.

**Why this priority**: This is the core change — making SpecKit the
default SDD framework during installation.

**Independent Test**: Run `./install.sh` on a clean machine without
SpecKit installed. Verify the version prompt appears, installation
proceeds, and the framework completes setup successfully.

**Acceptance Scenarios**:

1. **Given** SpecKit is not installed, **When** user runs `./install.sh`,
   **Then** the installer asks which SpecKit version to install and
   installs it upon confirmation
2. **Given** SpecKit is already installed, **When** user runs
   `./install.sh`, **Then** the installer shows the current version and
   skips installation
3. **Given** SpecKit installation fails or user declines, **When** the
   installer encounters this, **Then** it shows a skip message and
   continues with the remaining installation steps

---

### User Story 2 - Remove .opencode from Git Tracking (Priority: P1)

The `.opencode/` directory MUST be removed from git tracking and added to
`.gitignore`. Each developer configures their own `.opencode/` directory
locally after cloning. The directory MUST NOT be committed to the
repository.

**Why this priority**: This is a prerequisite for clean per-user
configuration and must be done alongside the GSD removal.

**Independent Test**: After changes, verify `.opencode/` is in
`.gitignore`, `git ls-files .opencode/` returns nothing, and a fresh
clone does not contain `.opencode/` files.

**Acceptance Scenarios**:

1. **Given** `.opencode/` files are currently tracked, **When** changes
   are applied, **Then** the files are removed from git tracking (but
   remain on disk for current user)
2. **Given** a new clone of the repository, **When** developer checks
   out the code, **Then** no `.opencode/` directory exists
3. **Given** `.gitignore` is updated, **When** a developer creates
   `.opencode/` locally, **Then** git does not track it

---

### User Story 3 - Remove GSD References from Active Codebase (Priority: P2)

All references to GSD (GetShitDone) in actively-maintained project files
(PROJECT.md, STATE.md, CLAUDE.md) MUST be removed or replaced with
SpecKit equivalents. Historical `.planning/phases/` documents are
preserved as-is since they are records of past work.

**Why this priority**: Removes confusion for new contributors who would
see references to a deprecated tool.

**Independent Test**: Search for "GSD", "gsd", "GetShitDone", or
"get-shit-done" in non-historical files. No results should appear.

**Acceptance Scenarios**:

1. **Given** PROJECT.md references GSD workflows, **When** changes are
   applied, **Then** references are updated to SpecKit equivalents or
   removed
2. **Given** STATE.md uses GSD commands, **When** changes are applied,
   **Then** commands are updated to SpecKit equivalents
3. **Given** historical phase documents in `.planning/phases/`, **When**
   reviewing changes, **Then** these files are left unchanged (they are
   historical records)

---

### User Story 4 - Dependency Availability Check (Priority: P2)

During installation, the installer checks if all SpecKit dependencies
are available on the system. For each missing dependency, it asks the
user whether to install it. If the user declines, the installer skips
that dependency and continues.

**Why this priority**: Ensures a smooth installation experience where
users have control over what gets installed.

**Independent Test**: Run `./install.sh` with a missing SpecKit
dependency. Verify the user is prompted and can decline without the
installer failing.

**Acceptance Scenarios**:

1. **Given** a SpecKit dependency is missing, **When** the installer
   detects it, **Then** it asks the user if they want to install it
2. **Given** the user declines a dependency install, **When** the
   installer receives the decline, **Then** it shows a skip message and
   continues
3. **Given** all dependencies are present, **When** the installer checks,
   **Then** it shows confirmation and proceeds without prompting

---

### Edge Cases

- What happens when the user has no internet during SpecKit installation?
  Show error message and skip gracefully.
- What happens when the user specifies an invalid SpecKit version?
  Show available versions (if possible) or error message and skip.
- What happens when `.opencode/` has uncommitted local changes?
  `git rm --cached` preserves local files; user's local config is not lost.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: install.sh MUST check if SpecKit is already installed before
  attempting installation
- **FR-002**: install.sh MUST prompt the user to select a SpecKit version
  when not installed
- **FR-003**: install.sh MUST skip SpecKit installation gracefully if it
  fails or user declines
- **FR-004**: `.opencode/` MUST be added to `.gitignore`
- **FR-005**: `.opencode/` MUST be removed from git tracking via
  `git rm -r --cached .opencode/`
- **FR-006**: All GSD references in PROJECT.md, STATE.md, and CLAUDE.md
  MUST be removed or replaced with SpecKit equivalents
- **FR-007**: Historical `.planning/phases/` documents MUST NOT be
  modified (they are records of past decisions)
- **FR-008**: install.sh MUST check SpecKit dependencies availability
  and prompt user before installing each
- **FR-009**: The installer MUST NOT hard-fail if SpecKit or its
  dependencies cannot be installed

### Key Entities

- **install.sh**: Main installer script that orchestrates all setup steps
- **SpecKit**: GitHub's specification-driven development framework
  (https://github.com/github/spec-kit) — replaces GSD
- **.opencode/**: Per-user OpenCode configuration directory (agents,
  commands, benchmark configs)
- **.gitignore**: Repository ignore rules file

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Zero GSD/GetShitDone references in non-historical tracked
  files after changes are applied
- **SC-002**: `.opencode/` is not tracked by git (verified via
  `git ls-files .opencode/` returning empty)
- **SC-003**: Fresh `./install.sh` run on a machine without SpecKit
  prompts for version and completes without errors
- **SC-004**: User can decline all optional installations and the
  installer still completes successfully
- **SC-005**: Existing users' local `.opencode/` configurations are
  preserved on disk after git tracking removal

## Clarifications

### Session 2026-06-01

- Q: How should SpecKit be installed? → A: npm global install (`npm install -g @github/spec-kit@<version>`)

## Assumptions

- GitHub SpecKit is installed via npm: `npm install -g @github/spec-kit@<version>`
- SpecKit version selection can be done by querying npm registry
  (`npm view @github/spec-kit versions --json`)
- Historical `.planning/phases/` documents are read-only archives and
  will not confuse users if they contain old GSD references
- The `.opencode/benchmark/reports/` gitignore entry (already present)
  is superseded by the broader `.opencode/` ignore rule
