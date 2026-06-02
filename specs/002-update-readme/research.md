# Research: Update README

**Feature**: 002-update-readme | **Date**: 2026-06-02

## Research Findings

### 1. Current README State

**Decision**: The existing README is comprehensive (1037 lines) and well-structured. It needs targeted additions, not a rewrite.

**Rationale**: The README already covers architecture, CLI reference, MCP tools, benchmarking, configuration, troubleshooting, and development. The gaps are:

- SpecKit CLI (`specify`) not mentioned in prerequisites or installer steps
- No mention that `.opencode/` is now per-user (untracked)
- Prerequisites table missing SpecKit entry

**Alternatives considered**:

- Full rewrite — rejected; existing content is accurate and thorough
- Separate tutorial doc — rejected; README is the sole onboarding doc per spec assumptions

### 2. SpecKit Prerequisites

**Decision**: Add SpecKit (`specify` CLI) to the prerequisites table as an optional tool, and document the installer step.

**Rationale**:

- SpecKit is installed via `uv tool install` (Python-based, requires Python 3.11+ and uv)
- It's optional — the framework works without it
- The installer (`install.sh`) now includes a `setup_speckit` step after OpenCode
- Once installed globally, it enables `/speckit.*` slash commands in OpenCode

### 3. Sections Requiring Updates

**Decision**: The following README sections need modification:

| Section                               | Change                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| Prerequisites table                   | Add SpecKit row (optional)                                                            |
| Quick Start "The installer will" list | Add bullet for SpecKit step                                                           |
| After "Recent Improvements"           | Add brief note about v1.8/current changes (SpecKit integration, .opencode/ untracked) |

**Rationale**: Minimal targeted changes maintain consistency with the existing writing style and structure.

### 4. .opencode/ Per-User Config Note

**Decision**: Add a brief note in the Configuration or Quick Start section explaining that `.opencode/` is per-user configuration (not tracked in git).

**Rationale**: New users who see `.opencode/` locally but not in the repo might be confused. A single sentence clarifies this.

## Unresolved Items

None — all items resolved.
