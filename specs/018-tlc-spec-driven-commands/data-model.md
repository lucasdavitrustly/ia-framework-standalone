# Phase 1 Data Model: TLC Spec-Driven Slash Commands

This feature is filesystem/config-oriented; the "data model" describes the entities the design manipulates rather than database tables.

## Entity: TLC Command

A named, invokable slash-command entry point mapped to one skill phase or action.

| Field | Type | Rules |
|---|---|---|
| `name` | string | MUST match `tlc-<action>` (FR-015); unique across the skill's commands |
| `description` | string | Non-empty; shown in the command palette (FR-011) |
| `argument-hint` | string | Present when the command takes input (e.g. `"<feature description>"`) (FR-011) |
| `tools` | map<string,bool> | Grants only the tools the action needs (least privilege) |
| `phase_or_action` | enum | One of: `specify`, `design`, `tasks`, `execute`, `quick`, `project-init`, `roadmap`, `map-codebase`, `state`, `session` |
| `triggers_branch` | bool | `true` for `specify` and `quick` (FR-005/FR-006); `false` otherwise |
| `source_file` | path | Single shared file `skills/tlc-spec-driven/commands/<name>.md` (FR-016) |

**Relationships**: each Command references exactly one skill phase/action (behavioral parity with its natural-language trigger, FR-004).

## Entity: Feature Spec

A numbered feature specification initiated via `tlc-specify`.

| Field | Type | Rules |
|---|---|---|
| `number` | int (3-digit) | Sequential, collision-free across all numbering sources (FR-008, SC-003) |
| `slug` | string | Lowercase, `-`-separated; derived from short name/description |
| `branch` | string | `NNN-<slug>`, created from current HEAD (FR-017), never overwritten (FR-012) |
| `directory` | path | Under the skill's `.specs/features/` namespace |

## Entity: Quick Task

A numbered ad-hoc task initiated via `tlc-quick`.

| Field | Type | Rules |
|---|---|---|
| `number` | int (3-digit) | Same numbering pool as Feature Spec (FR-008) |
| `slug` | string | Same slug rules |
| `branch` | string | `NNN-<slug>`, created from current HEAD before implementation (FR-006/FR-017) |
| `record` | path | Under the skill's `.specs/quick/NNN-slug/` namespace |

## Entity: Target IDE

An installation destination.

| Field | Type | Rules |
|---|---|---|
| `id` | string | e.g. `opencode`, `claude-code`, `cursor` |
| `supports_commands` | bool | From `scripts/ide-descriptors/<id>.sh` (`IDE_SUPPORTS_COMMANDS`) |
| `commands_dir` | path | Where command files are linked when supported |

**Rule**: commands are linked into an IDE **iff** `skill.assets.commands === true` AND `supports_commands === true` (FR-009/FR-010).

## Entity: Spec Number (value)

The shared sequential identifier.

- **Computation**: `max(highest .specs/features, highest .specs/quick, highest local branch, highest remote branch) + 1` (FR-008).
- **Format**: `printf '%03d'`, base-10 forced.
- **Invariant**: never collides with any existing number in any source (SC-003).

## State transitions

**Feature Spec / Quick Task lifecycle on initiation**:

```
(none) → compute next number
       → derive slug
       → if branch NNN-slug exists: checkout existing (no overwrite)   [FR-012]
         else: create + checkout NNN-slug from current HEAD            [FR-017]
       → create spec/quick artifact directory
```

No further state machine is required for this feature.
