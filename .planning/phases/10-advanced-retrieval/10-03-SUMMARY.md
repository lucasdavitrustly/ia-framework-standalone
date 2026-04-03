---
phase: '10'
plan: '03'
title: 'GSD-RAG integration (MCP approach), agents inject/check CLI commands, install.sh wiring'
subsystem: 'cli, install, research'
tags: ['gsd-rag', 'agents-inject', 'cli', 'install', 'mcp', 'research']
dependency-graph:
  requires: ['10-02']
  provides:
    [
      'agents inject CLI command',
      'agents check CLI command',
      'install.sh Step 6.5',
      'GSD-RAG research',
      'RETR-04 research',
      'WKFL-03 verification',
    ]
  affects: ['target-project-agents-docs', 'CLAUDE.md']
tech-stack:
  added: []
  patterns:
    [
      'marker-based idempotent injection (<!-- ia-framework:rag-start/end -->)',
      'auto-detect AGENTS.md/CLAUDE.md',
      '--file override for custom paths',
    ]
key-files:
  created:
    - packages/cli/src/commands/agents.command.ts
    - packages/cli/src/commands/agents.command.test.ts
    - .planning/research/GSD-RAG-INTEGRATION.md
    - .planning/research/RETR-04-AUTO-CONTEXT.md
  modified:
    - packages/cli/src/bin.ts
    - install.sh
    - CLAUDE.md
decisions:
  - 'GSD-RAG integration via MCP tools (won 11-1-0 over CLI subprocess in research spike)'
  - "WKFL-03 (online LLMs) satisfied by OpenCode's 75+ provider model config — no implementation needed"
  - "Agent docs injection targets the target project's AGENTS.md/CLAUDE.md, not the framework's own docs"
  - 'Marker-based idempotency for agent docs injection (<!-- ia-framework:rag-start/end -->)'
  - 'Target project file auto-detection: AGENTS.md first, CLAUDE.md second, default to creating AGENTS.md'
  - '--file flag for re-running to inject into additional files'
  - 'install.sh delegates to CLI command (handles interactive prompts)'
  - "Framework's own CLAUDE.md gets minimal pointer, not the full guidance"
metrics:
  duration: '~12 minutes'
  completed: '2026-04-02'
  tasks: 6
  files: 7
---

# Phase 10 Plan 03: GSD-RAG Integration + Target Project Agent Docs

**One-liner:** Research artifacts saved, `ia-framework agents inject/check` CLI commands built (TDD), install.sh wired, and WKFL-03 verified as satisfied by OpenCode's model config.

## Tasks Completed

| #   | Task                               | Commit    | Key Files                                       |
| --- | ---------------------------------- | --------- | ----------------------------------------------- |
| 1   | Save research artifacts            | `28cf094` | GSD-RAG-INTEGRATION.md, RETR-04-AUTO-CONTEXT.md |
| 2   | `agents inject` CLI command (TDD)  | `28cf094` | agents.command.ts, agents.command.test.ts       |
| 3   | `agents check` CLI command         | `28cf094` | agents.command.ts, agents.command.test.ts       |
| 4   | install.sh integration (Step 6.5)  | `28cf094` | install.sh                                      |
| 5   | Framework CLAUDE.md minimal note   | `28cf094` | CLAUDE.md                                       |
| 6   | WKFL-03 verification documentation | `28cf094` | GSD-RAG-INTEGRATION.md                          |

## What Was Built

### Research Artifacts (Task 1)

**GSD-RAG-INTEGRATION.md:**

- Full 12-dimension comparison table: MCP tools vs CLI subprocess
- Final score: MCP 11 — Tie 1 — CLI 0
- Recommendation: MCP tools as primary RAG integration
- CLI role: human debugging, CI pipelines, scripting (not AI-driven workflows)
- WKFL-03 verification table included

**RETR-04-AUTO-CONTEXT.md:**

- MCP Resources: not viable (application-driven, OpenCode doesn't implement)
- MCP Prompts: not viable (user-controlled, OpenCode doesn't implement)
- OpenCode plugins: no `prompt.before` hook available
- Tool-based approach is more token-efficient (on-demand, not auto-prepended)
- V2 prerequisites documented in priority order

### `ia-framework agents inject` CLI Command (Tasks 2-3 — TDD)

- `agentsCommand()` registers as top-level `agents` command with `inject` and `check` subcommands
- **inject**: loads config → auto-detects AGENTS.md/CLAUDE.md in target project → injects RAG guidance between `<!-- ia-framework:rag-start -->` / `<!-- ia-framework:rag-end -->` markers
- Idempotent: if markers exist, replaces content between them; if not, appends to end of file; if file doesn't exist, creates it
- `--file <path>` overrides auto-detection for custom file paths
- `--config <path>` for explicit config path (also reads `IA_FRAMEWORK_CONFIG` env var)
- **check**: scans AGENTS.md and CLAUDE.md in target project for `rag-start` marker, reports status

### Injected RAG Content

- Documents 4 MCP tools: `search_codebase`, `get_file`, `get_dependencies`, `query_database`
- Includes `expand_hops` parameter documentation for search_codebase
- "When to use" guidance: before modifying code, planning features, refactoring
- "Token-conscious usage" guidance: limit, score_threshold tuning tips

### install.sh Integration (Task 4)

- Step 6.5 added between Step 6 (OpenCode MCP) and Step 7 (Initial indexing)
- Runs `node packages/cli/dist/bin.js agents inject --config $CONFIG_FILE`
- Graceful: on failure, prints "Run 'ia-framework agents inject' later"
- Defers if CLI dist not built or config not present

### Framework CLAUDE.md Note (Task 5)

- Added "GSD + RAG Integration" section with pointer to target project docs
- References `ia-framework agents inject` and `agents check` commands

### WKFL-03 Verification (Task 6)

Documented as satisfied — no implementation required:

- OpenCode supports 75+ LLM providers (Anthropic, OpenAI, Google, xAI, DeepSeek, OpenRouter, etc.)
- Model selection is user-controlled via OpenCode config
- GSD workflows inherit OpenCode's active model
- ia-framework imposes no model constraint — provides tools only
- Local embeddings (Ollama) coexist with online reasoning models

## Test Results

| Package                                    | Tests | Status |
| ------------------------------------------ | ----- | ------ |
| @ia-framework/cli (agents.command.test.ts) | 8/8   | PASS   |

### agents inject Tests (5)

1. Injects RAG section into existing AGENTS.md when --file targets it
2. Replaces existing markers on re-run (idempotent)
3. Creates file when --file points to non-existent path
4. Exits with error when config load fails
5. Appends RAG section to end of existing file

### agents check Tests (3)

6. Reports injected when markers found in AGENTS.md
7. Reports injected when markers found in CLAUDE.md
8. Reports not injected when no markers in any file

## Requirements Completed

- **WKFL-01**: GSD planning phases automatically inject relevant architectural context from RAG — via `agents inject` into target project's AGENTS.md/CLAUDE.md, making MCP tools discoverable to AI agents during planning
- **WKFL-02**: GSD execution phases automatically inject relevant code context from RAG — same mechanism; MCP tools (`search_codebase`, `get_file`, `get_dependencies`) are documented in agent docs and available during execution
- **WKFL-03**: GSD workflows can use online LLMs for reasoning — satisfied by OpenCode's 75+ provider model config; ia-framework provides tools only, no model constraints

## Deviations from Plan

- Auto-detection logic simplified: if neither AGENTS.md nor CLAUDE.md exists, defaults to creating AGENTS.md (skips interactive prompt — non-interactive CLI context)
- `--config` flag shortened to `-c` for ergonomics

## Known Stubs

None — all implementations are complete with real file I/O and config loading.
