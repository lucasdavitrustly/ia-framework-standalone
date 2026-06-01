# Quickstart: Replace GSD with SpecKit

**Feature**: 001-replace-gsd-speckit

## What This Feature Does

Replaces the deprecated GSD framework with GitHub SpecKit by:

1. Adding `specify` CLI installation to `install.sh` (globally available for any project)
2. Removing `.opencode/` from git tracking (per-user config)
3. Cleaning up GSD references in active documentation

## Implementation Steps (High-Level)

### Step 1: Create scripts/install-speckit.sh

Follow the existing `scripts/install-docker.sh` pattern:

```bash
#!/usr/bin/env bash
# Checks and installs: Python 3.11+ → uv → specify CLI

check_python() {
  # python3 --version, parse and compare >= 3.11
}

check_uv() {
  command -v uv &>/dev/null
}

install_uv() {
  # Prompt user, then: curl -LsSf https://astral.sh/uv/install.sh | sh
}

check_specify() {
  command -v specify &>/dev/null
}

install_specify() {
  # Query versions from GitHub, prompt user, then:
  # uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v<VERSION>
}

setup_speckit() {
  # Orchestrate: check_python → check/install uv → check/install specify
  # Skip gracefully at any failure point
}
```

### Step 2: Integrate into install.sh

Add source line and function call:

```bash
source "${SCRIPT_DIR}/scripts/install-speckit.sh"
# ... later in the sequence:
setup_speckit
```

### Step 3: Remove .opencode/ from git tracking

```bash
git rm -r --cached .opencode/
```

Update `.gitignore`:

```
# OpenCode per-user configuration (not tracked)
.opencode/
```

Remove the old partial rules for `.opencode/benchmark/reports/` and `.opencode/benchmark/report.md`.

### Step 4: Remove GSD references

Update `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/VALIDATION.md`, and `CLAUDE.md` to replace GSD references with SpecKit equivalents.

## Verification

```bash
# Verify specify is installed
specify --version

# Verify .opencode/ is not tracked
git ls-files .opencode/
# Should return empty

# Verify no GSD references in active files
grep -r "GSD\|GetShitDone\|get-shit-done" --include="*.md" . \
  | grep -v .planning/phases \
  | grep -v .planning/quick \
  | grep -v node_modules \
  | grep -v specs/
# Should return empty

# Verify installer runs without errors
./install.sh
# Should complete, showing SpecKit status
```

## Key Decisions from Research

1. SpecKit CLI is `specify`, installed via `uv tool install` from GitHub (Python-based, not npm)
2. Once installed globally, it works for **any project** — not just ia-framework
3. Prerequisites: Python 3.11+ → uv → specify
4. The `.specify/` directory in the repo is the project config (already committed); the CLI reads it at runtime
5. All installation steps are optional — user can decline and the installer continues
