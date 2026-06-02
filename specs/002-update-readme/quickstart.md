# Quickstart: Update README

**Feature**: 002-update-readme

## What This Feature Does

Updates the README.md to reflect the current project state, ensuring new users have complete onboarding documentation including SpecKit CLI integration.

## Implementation Steps (High-Level)

### Step 1: Add SpecKit to Prerequisites Table

Add a row to the prerequisites table:

| Tool        | Version | Install method                                               | Required           | Notes                                                                                                                              |
| ----------- | ------- | ------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **SpecKit** | Latest  | `uv tool install specify-cli` (requires Python 3.11+ and uv) | **No** — soft fail | Enables `/speckit.*` slash commands in OpenCode for spec-driven development. Installed via the `setup_speckit` step in install.sh. |

### Step 2: Update Quick Start Installer Steps

Add to the "The installer will:" numbered list (after OpenCode):

- Check and optionally install **SpecKit** (Python 3.11+ → uv → specify CLI) for spec-driven development workflows

### Step 3: Add Note About .opencode/

In the Configuration section or after Quick Start, add:

> **Note:** The `.opencode/` directory contains per-user OpenCode configuration (slash commands, skills, agents). It is not tracked in git — each developer's local copy is independent.

### Step 4: Verify CLI Commands Are Complete

Cross-reference the CLI Reference section against the actual commands in `packages/cli/src/commands/` to ensure nothing is missing.

## Verification

```bash
# Check README renders correctly
# (visual inspection on GitHub or local markdown preview)

# Verify no GSD references leaked in
grep -i "gsd\|GetShitDone" README.md
# Should return empty

# Verify SpecKit is mentioned
grep -i "speckit\|specify" README.md
# Should return matches
```
