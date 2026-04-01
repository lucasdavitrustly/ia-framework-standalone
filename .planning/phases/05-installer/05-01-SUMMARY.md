---
phase: 05-installer
plan: "01"
subsystem: installer
tags: [installer, shell, prerequisites, docker, bash]
dependency_graph:
  requires: [04-03-integration-verification]
  provides: [install.sh, prerequisite-detection, service-startup, config-init]
  affects: [05-02-cli, 05-03-integration]
tech_stack:
  added: []
  patterns: [POSIX bash with set -euo pipefail, colored terminal output, idempotent installer steps]
key_files:
  created:
    - install.sh
    - scripts/check-prerequisites.sh
    - scripts/install-docker.sh
    - scripts/install-node.sh
    - scripts/install-ollama.sh
    - scripts/install-opencode.sh
    - scripts/start-services.sh
    - scripts/init-config.sh
  modified: []
decisions:
  - "Ollama and OpenCode are soft-fail installs (non-fatal) — Docker and Node.js are hard-fail (framework cannot run without them)"
  - "init_config() uses a read-loop with validation rather than a single prompt — prevents empty or invalid paths from silently writing bad config"
  - "start_qdrant() polls /readyz up to 30s and returns non-zero on timeout rather than sleeping blindly"
metrics:
  duration: "~3 minutes"
  completed: "2026-04-01"
  tasks_completed: 3
  files_created: 8
---

# Phase 05 Plan 01: Shell Installer Summary

**One-liner:** One-shot installer with idempotent prerequisite detection (Docker, Node>=22, Ollama, OpenCode), Qdrant service startup, and config initialization for target project path.

## What Was Done

Created the complete shell installer infrastructure:
- `install.sh`: Main entrypoint with 7-step installation flow and colored output
- `scripts/check-prerequisites.sh`: Detects all 4 required tools with version checks
- `scripts/install-{docker,node,ollama,opencode}.sh`: Platform-aware installers (macOS/Linux)
- `scripts/start-services.sh`: Starts Qdrant via docker compose, polls /readyz for readiness
- `scripts/init-config.sh`: Prompts for target project path, writes `.ia-framework/project.json`

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Prerequisite detection and install scripts | 2ac9c57 |
| 2 | Service startup and config initialization scripts | 2ac9c57 |
| 3 | Main install.sh entrypoint | 2ac9c57 |

## Installer Flow

```
./install.sh
  Step 1: Prerequisites — Docker, Node.js, Ollama, OpenCode
  Step 2: Package manager — pnpm
  Step 3: Build — pnpm install && pnpm build
  Step 4: Configure — init_config() → .ia-framework/project.json
  Step 5: Services — start Qdrant (docker compose up -d qdrant)
  Step 6: OpenCode MCP — configure_opencode() [from 05-03]
  Step 7: Initial indexing — node packages/cli/dist/bin.js index [from 05-02]
```

## ROADMAP Success Criteria

1. **./install.sh detects and installs missing prerequisites** ✅ — Docker, Node.js, Ollama, OpenCode with platform-aware installers
2. **Installer skips tools already present** ✅ — Each check function returns early if already installed
3. **Qdrant container with named volumes** ✅ — Reuses existing docker-compose.yml with `qdrant_data` named volume
4. **Config prompts for target project path** ✅ — init_config() validates path exists before writing

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- Steps 6 (configure-opencode) and 7 (initial indexing) reference scripts/binaries not yet created — they are guarded with `[ -f ... ]` checks and will be populated in Plans 05-02 and 05-03.

## Self-Check: PASSED

- `install.sh` → FOUND ✅
- `scripts/check-prerequisites.sh` → FOUND ✅
- `scripts/install-docker.sh` → FOUND ✅
- `scripts/install-node.sh` → FOUND ✅
- `scripts/install-ollama.sh` → FOUND ✅
- `scripts/install-opencode.sh` → FOUND ✅
- `scripts/start-services.sh` → FOUND ✅
- `scripts/init-config.sh` → FOUND ✅
- All scripts syntax valid → ✅
- install.sh executable → ✅
- Commit 2ac9c57 → FOUND ✅
