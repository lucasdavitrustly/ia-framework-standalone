# Quickstart: TLC Spec-Driven Slash Commands

How the feature behaves once implemented, and how to verify it.

## For users

On a command-capable IDE (OpenCode or Claude Code), after installing the skill:

```
/tlc-specify "add rate limiting to the public API"
   → creates & checks out branch NNN-add-rate-limiting, then runs Specify

/tlc-design            → runs the Design phase for the active feature
/tlc-tasks             → breaks the design into atomic tasks
/tlc-execute           → implements tasks with verification
/tlc-quick "fix: login 401 on expired token refresh"
   → creates & checks out a branch, then runs Quick mode

/tlc-project-init "my-app"   → initializes PROJECT.md + ROADMAP.md
/tlc-roadmap                 → creates/updates the roadmap
/tlc-map-codebase            → brownfield mapping
/tlc-state "decision: use hyphenated command names"
/tlc-session "pause"         → session handoff
```

On IDEs without slash-command support (Cursor, Gemini, Codex, VS Code Copilot, Windsurf): no commands appear, and the skill is triggered exactly as before via natural language ("specify a feature to…", "quick fix: …"). Installation succeeds with no errors.

## Verification steps

1. **Install links commands only where supported**
   - Run the skill installer selecting `tlc-spec-driven`.
   - Assert: a `tlc-specify.md` symlink exists under `~/.config/opencode/command/` and the Claude Code commands dir.
   - Assert: no command symlink is created for a command-less IDE; installer exits 0. (FR-009/FR-010)

2. **New feature spec creates a branch from HEAD**
   - From a clean checkout, run `/tlc-specify "<desc>"`.
   - Assert: new branch `NNN-<slug>` is checked out; its parent commit equals the prior HEAD. (FR-005/FR-017)

3. **Quick task creates a branch**
   - Run `/tlc-quick "<one-liner>"`.
   - Assert: a branch is created/checked out before any file changes; quick record created. (FR-006)

4. **No overwrite of existing branch**
   - Pre-create `NNN-<slug>`; initiate again.
   - Assert: helper switches to it; no reset/force. (FR-012)

5. **Numbering has no collisions**
   - Seed `.specs/features/`, `.specs/quick/`, and a branch with differing numbers.
   - Assert: next number = global max + 1. (FR-008/SC-003)

6. **Branch helper runs the shell tests**
   - `sh skills/tlc-spec-driven/scripts/tests/new-feature-branch.test.sh`
   - Assert: T1–T10 pass (see contracts/branch-helper.md).

7. **Discoverability**
   - Open the IDE command palette.
   - Assert: each `tlc-*` command shows a description + argument hint. (FR-011)

## Definition of done (maps to Success Criteria)

- All 4 phases + quick invokable as commands on command-capable IDEs (SC-001).
- New spec/quick initiation branches with no manual git steps (SC-002).
- Zero numbering collisions (SC-003).
- Command-less install: 0 errors, natural language preserved (SC-004).
- Command discoverable from palette without docs (SC-005).
- Branch creation works with no `.specify/` present (SC-006).
