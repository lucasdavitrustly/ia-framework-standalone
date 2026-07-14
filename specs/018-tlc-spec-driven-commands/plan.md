# Implementation Plan: TLC Spec-Driven Slash Commands

**Branch**: `018-tlc-spec-driven-commands` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-tlc-spec-driven-commands/spec.md`

## Summary

Package the `tlc-spec-driven` skill's phases and key actions as first-class slash commands, delivered through the existing skill installer, and add self-contained git-branch creation whenever a new feature spec or quick task is initiated. Commands use the `tlc-<action>` naming convention (FR-015), are defined as a single shared file per action (FR-016), and branch off the current HEAD (FR-017). Branch/numbering logic is owned by the skill with **zero** dependency on SpecKit or `.specify/` (FR-007, Option B). On IDEs without slash-command support (5 of 7 targets), installation still succeeds and the skill remains usable via natural-language triggers (FR-010).

Technical approach: add `commands/*.md` files under `skills/tlc-spec-driven/`, flip `skill.json` `assets.commands` to `true` so `scripts/install-skills.sh` links them into command-capable IDEs, add a self-contained POSIX-sh branch helper under the skill, and update SKILL.md + the `specify.md`/`quick-mode.md` references to document the command entry points and branch-on-init behavior.

## Technical Context

**Language/Version**: POSIX shell (sh/bash) for the branch helper; Markdown (with YAML frontmatter) for command files and skill docs. No TypeScript source is added.

**Primary Dependencies**: `git` (branch creation); the existing `scripts/install-skills.sh` symlink installer; `scripts/ide-descriptors/*.sh` capability flags. No new runtime libraries.

**Storage**: Filesystem only — the skill's `.specs/features/` and `.specs/quick/` directories are the numbering source of truth, alongside local/remote git branches. No database.

**Testing**: `bats`-style / shell assertions or a lightweight shell test harness for the branch helper (numbering, existing-branch, no-git edge cases); manual/scripted install verification against `opencode` and `claude-code` descriptors plus one command-less descriptor. Vitest does not apply (no TS code).

**Target Platform**: Developer workstations (macOS/Linux) running any of the 7 supported IDEs. Only `opencode` and `claude-code` receive commands.

**Project Type**: Skill package extension (docs + shell), part of the ia-framework monorepo. Not an MCP tool or CLI subcommand.

**Performance Goals**: Branch creation completes in under ~2s in the common case (local branch scan; remote fetch is skip-able). Not a hot path.

**Constraints**: No SpecKit/`.specify/` dependency (FR-007); no per-IDE command variants (FR-016); no installer changes beyond the `assets.commands` flag; graceful degradation on command-less IDEs (FR-010); must not overwrite existing branches (FR-012).

**Scale/Scope**: ~10 command files (4 phases + quick + ~5 project/state actions per FR-003), 1 branch helper script, 1 `skill.json` edit, SKILL.md + 2 reference doc updates. Single skill, single package area.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| **I. TDD** | Applies to the branch helper script: numbering/edge-case behavior MUST have shell tests written first (red-green-refactor). Markdown command files and doc updates are declarative and not unit-testable; they are covered by an install-verification check. Vitest is TS-only and does not apply here. | PASS (with justification) |
| **II. TypeScript-Only** | No source code is added — the artifacts are Markdown + POSIX shell, consistent with existing skills (`mcp-bench`, `tab-refuter`) and SpecKit scripts which are shell. The "TypeScript-Only" rule governs the framework's `packages/` source, not skill assets. | PASS (out of scope) |
| **III. Local-First** | Fully local; only touches git and the filesystem. No external services. | PASS |
| **IV. Monorepo Architecture** | Changes are confined to `skills/tlc-spec-driven/` plus a one-line `skill.json` flag; no new package, no cross-package coupling, no circular deps. | PASS |
| **V. Simplicity / No Heavy Abstractions** | Single shared command file per action (FR-016); one small self-contained shell helper mirroring the proven SpecKit numbering algorithm rather than a new abstraction. YAGNI honored — only the requested actions become commands. | PASS |
| **VI. Incremental by Default** | Not an indexing feature; N/A. Installer already re-links incrementally via symlinks. | N/A |
| **VII. MCP-First Interface** | This feature is a skill/command surface for AI assistants, not an MCP tool. It complements the MCP-first principle (improves the assistant workflow) without adding CLI-as-primary-interface. | PASS (complementary) |

**Gate result**: PASS. No unjustified violations. The TDD principle is satisfied for the only testable artifact (the branch helper); Complexity Tracking is not required.

## Project Structure

### Documentation (this feature)

```text
specs/018-tlc-spec-driven-commands/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (command + branch-helper contracts)
│   ├── commands.md
│   └── branch-helper.md
├── checklists/
│   └── requirements.md  # From /speckit.specify
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
skills/tlc-spec-driven/
├── SKILL.md                      # UPDATED: document command entry points + branch-on-init
├── skill.json                    # UPDATED: assets.commands = true
├── commands/                     # NEW: one shared file per action (FR-016)
│   ├── tlc-specify.md
│   ├── tlc-design.md
│   ├── tlc-tasks.md
│   ├── tlc-execute.md
│   ├── tlc-quick.md
│   ├── tlc-project-init.md
│   ├── tlc-roadmap.md
│   ├── tlc-map-codebase.md
│   ├── tlc-state.md
│   └── tlc-session.md
├── scripts/                      # NEW: self-contained branch/numbering logic (FR-007/008/017)
│   ├── new-feature-branch.sh
│   └── tests/
│       └── new-feature-branch.test.sh
└── references/
    ├── specify.md                # UPDATED: branch-on-new-spec behavior
    ├── quick-mode.md             # UPDATED: branch-on-new-quick-task behavior
    └── ...                       # (unchanged reference files)

scripts/
├── install-skills.sh             # UNCHANGED (already honors assets.commands + IDE capability)
└── ide-descriptors/*.sh          # UNCHANGED (capability flags drive command linking)
```

**Structure Decision**: All changes live under `skills/tlc-spec-driven/` (the skill package) with a single `skill.json` flag flip. No changes to the installer or IDE descriptors are required — they already gate command linking on `assets.commands === true` AND `IDE_SUPPORTS_COMMANDS === true`, which delivers FR-009/FR-010 for free. The branch helper is a new self-contained shell script inside the skill so it carries no `.specify/` dependency (FR-007).

## Complexity Tracking

> No constitutional violations require justification. This section intentionally left empty.
