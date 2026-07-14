# Phase 0 Research: TLC Spec-Driven Slash Commands

All open clarifications were resolved during `/speckit.clarify` (naming, delivery model, branch base). This document records the grounding decisions and the rationale, derived from the existing codebase rather than speculation.

## R1. Command delivery mechanism

- **Decision**: Add `commands/*.md` files under `skills/tlc-spec-driven/` and set `assets.commands: true` in `skill.json`. The existing `scripts/install-skills.sh` (`install_skill()`) symlinks each `commands/*.md` into the IDE's command dir **only when** `assets.commands === true` AND the IDE descriptor's `IDE_SUPPORTS_COMMANDS === true`.
- **Rationale**: Mirrors how `mcp-bench` and `tab-refuter` ship commands today; requires no installer change. Satisfies FR-009 (linked into command-capable IDEs) and FR-010 (graceful skip on the rest) with zero extra code.
- **Alternatives considered**:
  - Add a dedicated CLI subcommand to install commands — rejected: the CLI (`packages/cli`) does not manage skills/commands; would duplicate the shell installer and violate Simplicity (V).
  - Reuse the repo-local SpecKit `.opencode/commands/speckit.*` system — rejected: out of scope; TLC targets non-SpecKit IDEs and must not depend on SpecKit.

## R2. Command naming convention (resolves Clarification Q1)

- **Decision**: `tlc-<action>` hyphenated (e.g. `tlc-specify`, `tlc-design`, `tlc-tasks`, `tlc-execute`, `tlc-quick`).
- **Rationale**: User-selected (FR-015). Shared recognizable prefix groups all TLC commands in the palette and avoids collisions with other skills' commands.
- **Alternatives considered**: dot-namespaced `tlc.<action>` (matches `tab.refuter`); bare `<action>` (collision risk). Both rejected per user choice.

## R3. Single shared command file vs per-IDE variants (resolves Clarification Q2)

- **Decision**: One shared command file per action, symlinked into every command-capable IDE (FR-016).
- **Rationale**: Both command-capable targets (OpenCode, Claude Code) consume the same Markdown+frontmatter command format the installer already links. A single source avoids drift and duplication (Simplicity, V).
- **Alternatives considered**: Per-IDE variants — rejected: unnecessary duplication; no evidence the two formats diverge for these commands.

## R4. Command file format

- **Decision**: YAML frontmatter with `name`, `description` (multi-line), `argument-hint`, and a `tools:` map granting the tools each command needs; body written as `<objective>`/`<process>`/`<constraints>` guidance that loads the relevant skill reference and enforces the branch step where applicable.
- **Rationale**: Matches the observed skill-command format (`skills/mcp-bench/commands/mcp-bench-run.md`, `skills/tab-refuter/commands/tab-refuter.md`). `argument-hint` + `description` satisfy discoverability (FR-011).
- **Alternatives considered**: Leaner SpecKit frontmatter (`description` only) — rejected: skill commands use the richer format and benefit from explicit tool scoping.

## R5. Self-contained branch + numbering logic (resolves FR-007/FR-008)

- **Decision**: New POSIX-sh helper `skills/tlc-spec-driven/scripts/new-feature-branch.sh` that:
  1. Computes the next sequential number as `max(highest .specs/features dir, highest .specs/quick dir, highest local branch, highest remote branch) + 1`, zero-padded to 3 digits (base-10 forced to avoid octal).
  2. Derives a slug from the short name/description (lowercase, non-alnum→`-`, collapse/trim dashes; stop-word filtering for descriptions).
  3. Creates and checks out `NNN-<slug>` **from the current HEAD** (FR-017); if the branch already exists, switches to it instead of overwriting (FR-012).
  4. Emits JSON `{BRANCH_NAME, FEATURE_NUM}` for the caller.
- **Rationale**: Mirrors the proven algorithm in `.specify/extensions/git/scripts/bash/create-new-feature.sh` (`check_existing_branches`, `generate_branch_name`, `clean_branch_name`) but is **reimplemented inside the skill** so it has no `.specify/` dependency (Option B, FR-007). Reusing a battle-tested algorithm satisfies Simplicity (V) while remaining portable.
- **Alternatives considered**:
  - Depend on `.specify/` when present — rejected by user (Option B).
  - Symlink/copy the SpecKit script — rejected: couples the skill to SpecKit's layout and license/versioning.
  - Node/TS implementation — rejected: shell is the established idiom for skill scripts and avoids a runtime dependency for a git operation.

## R6. Numbering source of truth (resolves FR-008)

- **Decision**: The skill's own `.specs/features/` and `.specs/quick/` directories plus local+remote git branches. The `specs/` (SpecKit) directory is **not** consulted.
- **Rationale**: TLC's documented structure uses `.specs/` (per SKILL.md). Keeping numbering within the skill's own namespace avoids collisions (SC-003) without importing SpecKit conventions.
- **Alternatives considered**: Read `specs/` — rejected: that is SpecKit's namespace; would violate FR-007's independence and could cross-contaminate numbering.

## R7. Branch base (resolves Clarification Q3)

- **Decision**: Branch off the current HEAD; never auto-switch to a default/main branch first (FR-017).
- **Rationale**: User-selected; predictable and matches the SpecKit `git checkout -b` behavior. Avoids assumptions about the repo's default branch name.
- **Alternatives considered**: Always branch off main; prompt each time — both rejected per user choice.

## R8. Graceful degradation & discoverability

- **Decision**: Rely on the installer's existing capability gate for degradation (FR-010); add `description` + `argument-hint` to every command for palette discoverability (FR-011); empty-argument invocations prompt for the missing input (FR-014) rather than producing empty artifacts.
- **Rationale**: No new code needed for degradation. Discoverability and empty-arg prompting are properties of the command file content.
- **Alternatives considered**: Emitting a warning on command-less IDEs — rejected: the installer already skips silently; a warning would be noise. Documentation covers the natural-language fallback (FR-013).

## Open questions

None. All Technical Context items are resolved; no `NEEDS CLARIFICATION` markers remain.
