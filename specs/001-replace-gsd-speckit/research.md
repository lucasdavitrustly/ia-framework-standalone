# Research: Replace GSD with SpecKit

**Feature**: 001-replace-gsd-speckit | **Date**: 2026-06-01

## Research Findings

### 1. SpecKit Installation Method

**Decision**: SpecKit is a Python CLI tool called `specify`, installed globally via `uv tool install` from the GitHub repository.

**Rationale**: Per the official [github/spec-kit](https://github.com/github/spec-kit) README:

- The CLI is called `specify` (package name: `specify-cli`)
- It requires **Python 3.11+** and **uv** (or pipx) as prerequisites
- Install command: `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z`
- Latest version: v0.9.0 (as of 2026-06-01)
- Once installed globally, it works for **any project** (not just ia-framework)

**Alternatives considered**:

- npm global install — incorrect; SpecKit is Python-based, not Node.js
- pipx — supported alternative to uv, but uv is recommended by the project
- Manual clone — too complex for automated install

**Prerequisites chain**:

```
Python 3.11+ → uv (Astral package manager) → specify CLI
```

### 2. Two Components of SpecKit in a Project

**Decision**: SpecKit has two parts that must be understood separately:

| Component             | Location                | Purpose                                                      |
| --------------------- | ----------------------- | ------------------------------------------------------------ |
| `specify` CLI         | User's machine (global) | Executes SDD workflows, powers `/speckit.*` commands         |
| `.specify/` directory | In the repo (committed) | Project-local config: templates, scripts, memory, extensions |

**Rationale**: The `.specify/` directory is already committed to ia-framework (created by `specify init --here --integration opencode`). New users only need the CLI installed to use the `/speckit.*` slash commands.

### 3. uv Installation

**Decision**: Use the official uv installer script with user confirmation.

**Rationale**:

- Install: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- uv is the recommended package manager by the SpecKit project
- It's lightweight and fast
- Can also be installed via Homebrew: `brew install uv`

**Alternatives considered**:

- pipx — heavier, requires pip itself to be managed
- pip install — pollutes global Python environment

### 4. Version Selection

**Decision**: Query GitHub releases API for available versions and let user pick, defaulting to latest.

**Rationale**:

- GitHub API: `gh release list --repo github/spec-kit --limit 5` or curl the releases API
- Default to latest stable release
- User can pick an older version if needed (e.g., to match `.specify/init-options.json` pinned version)
- Current project pins `speckit_version: 0.8.15` in `.specify/init-options.json`

**Alternatives considered**:

- Hardcode version in install.sh — fragile, requires script updates
- Always install latest — might break compatibility with project's `.specify/` config

### 5. GSD References Location

**Decision**: GSD references exist in these non-historical files that need updating:

- `.planning/PROJECT.md` — references GSD workflows
- `.planning/STATE.md` — references GSD commands
- `.planning/VALIDATION.md` — references GSD processes
- `.planning/research/GSD-RAG-INTEGRATION.md` — research doc about GSD

**Rationale**: grep of the codebase reveals these as the active references. The `.planning/phases/` and `.planning/quick/` directories contain historical records and should be preserved per FR-007.

### 6. .opencode/ Git Tracking Removal

**Decision**: Use `git rm -r --cached .opencode/` and add `.opencode/` to `.gitignore`.

**Rationale**:

- `.gitignore` already has partial rules (`.opencode/benchmark/reports/`)
- Adding `.opencode/` as a top-level rule supersedes the partial rules
- `--cached` flag preserves local files on disk (FR-005)

### 7. Graceful Failure Strategy

**Decision**: At each step (Python, uv, specify), if the user declines or installation fails, print a skip message with manual install instructions and continue. The rest of ia-framework setup proceeds regardless.

**Rationale**:

- SpecKit is optional — the repo builds, tests, and runs without it
- Only the `/speckit.*` OpenCode commands require it
- Providing manual install instructions ensures users can set it up later

## Unresolved Items

None — all items resolved.
