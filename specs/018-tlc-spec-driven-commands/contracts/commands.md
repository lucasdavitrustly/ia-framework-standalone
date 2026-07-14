# Contract: TLC Slash Commands

The skill exposes slash commands (the interface to AI assistants / users). This is the command-surface contract.

## Naming & delivery

- All command names MUST match `tlc-<action>` (FR-015).
- Each action is defined by exactly one shared file `skills/tlc-spec-driven/commands/<name>.md` (FR-016).
- Files are linked into an IDE iff `skill.json` `assets.commands === true` AND the IDE descriptor's `IDE_SUPPORTS_COMMANDS === true` (FR-009/FR-010).

## Command file frontmatter (required shape)

```yaml
---
name: tlc-<action>
description: >
  One or more lines describing what the command does. Non-empty. (FR-011)
argument-hint: '<hint>'      # present when the command takes input (FR-011)
tools:                        # least-privilege grant
  read: true
  bash: true                  # required for commands that create branches
  # ...only what the action needs
---
```

Body: `<objective>` / `<process>` / `<constraints>` guidance that (a) loads the matching skill reference so command and natural-language paths stay equivalent (FR-004), and (b) for `tlc-specify`/`tlc-quick`, invokes the branch helper BEFORE writing artifacts.

## Command roster

| Command | phase_or_action | argument-hint | triggers_branch |
|---|---|---|---|
| `tlc-specify` | specify | `"<feature description>"` | yes (FR-005) |
| `tlc-design` | design | `"[feature]"` | no |
| `tlc-tasks` | tasks | `"[feature]"` | no |
| `tlc-execute` | execute | `"[task id]"` | no |
| `tlc-quick` | quick | `"<one-sentence task>"` | yes (FR-006) |
| `tlc-project-init` | project-init | `"[project name]"` | no |
| `tlc-roadmap` | roadmap | — | no |
| `tlc-map-codebase` | map-codebase | — | no |
| `tlc-state` | state | `"<decision\|blocker\|todo> <text>"` | no |
| `tlc-session` | session | `"<pause\|resume>"` | no |

## Behavioral contract

- **CO-1**: Invoking a command runs the same behavior as the equivalent natural-language trigger (FR-004).
- **CO-2**: `tlc-specify` and `tlc-quick` MUST create/switch to a branch before writing any artifact (FR-005/FR-006).
- **CO-3**: Every command exposes a non-empty `description` and, when it takes input, an `argument-hint` (FR-011).
- **CO-4**: A command invoked with empty required input MUST prompt for it, not produce an empty artifact (FR-014).
- **CO-5**: On a command-less IDE, no command file is linked and behavior is unchanged via natural language (FR-010).
