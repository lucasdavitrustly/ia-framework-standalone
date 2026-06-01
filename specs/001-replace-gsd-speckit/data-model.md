# Data Model: Replace GSD with SpecKit

**Feature**: 001-replace-gsd-speckit | **Date**: 2026-06-01

## Entities

### 1. scripts/install-speckit.sh (New)

Shell script module following the existing `scripts/install-*.sh` pattern.

**Functions**:

| Function                 | Purpose                                                 |
| ------------------------ | ------------------------------------------------------- |
| `check_python()`         | Verify Python 3.11+ is available                        |
| `check_uv()`             | Verify `uv` package manager is installed                |
| `install_uv()`           | Install uv via official script (with user confirmation) |
| `check_specify()`        | Verify `specify` CLI is available                       |
| `get_speckit_versions()` | Query GitHub releases for available versions            |
| `install_specify()`      | Install specify-cli via uv (with version selection)     |
| `setup_speckit()`        | Orchestrator: run all checks in sequence                |

**Dependencies**: curl (for uv install), git (for uv tool install from GitHub)

**Behavior rules**:

- Each step prompts user before installing anything
- If user declines → print skip message with manual instructions, continue
- If install fails → print error + manual instructions, continue
- Never hard-fail the overall installer

### 2. install.sh (Modified)

**Changes**:

- Add `source "${SCRIPT_DIR}/scripts/install-speckit.sh"`
- Call `setup_speckit` in the installation sequence (after OpenCode, since OpenCode is the consumer)

### 3. .gitignore (Modified)

**Change**: Add `.opencode/` as a top-level ignore rule. Remove the now-redundant partial rules for `.opencode/benchmark/reports/` and `.opencode/benchmark/report.md`.

### 4. .planning/PROJECT.md, STATE.md, VALIDATION.md (Modified)

**Change**: Replace GSD workflow/command references with SpecKit equivalents (`/speckit.*` commands) or remove if no longer relevant.

### 5. CLAUDE.md (Modified if applicable)

**Change**: Remove any GSD references.

## Relationships

```
install.sh ──sources──→ scripts/install-speckit.sh
install-speckit.sh ──checks──→ python3 (>= 3.11)
install-speckit.sh ──checks/installs──→ uv
install-speckit.sh ──checks/installs──→ specify CLI
specify CLI ──reads──→ .specify/ (project config)
specify CLI ──powers──→ /speckit.* OpenCode slash commands
```

## Validation Rules

- Python version MUST be >= 3.11 (checked via `python3 --version`)
- uv detection via `command -v uv` or `uv --version`
- specify detection via `command -v specify` or `specify --version`
- Version query via GitHub releases API or `gh release list`
- `git rm --cached` MUST be run before `.gitignore` update to avoid tracking conflicts

## State Transitions

N/A — no stateful entities. All operations are idempotent (re-running install.sh skips already-installed components).
