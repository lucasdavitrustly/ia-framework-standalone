---
phase: quick
plan: 01
subsystem: benchmark-workflow
tags: [benchmark, opencode, mcp, preflight]
dependency-graph:
  requires: [benchmark-preflight]
  provides: [opencode-benchmark-preflight-reporting]
  affects: [.opencode/agents, .opencode/benchmark, .opencode/skills]
tech-stack:
  added: []
  patterns: [structured-preflight-reporting, degraded-state-reporting]
key-files:
  created:
    - .planning/quick/260424-113051-wire-benchmark-preflight-opencode/260424-113051-wire-benchmark-preflight-opencode-PLAN.md
  modified:
    - .opencode/agents/benchmark-executor.md
    - .opencode/agents/benchmark-orchestrator.md
    - .opencode/agents/benchmark-reporter.md
    - .opencode/benchmark/guide.md
    - .opencode/skills/rag-benchmark/SKILL.md
decisions:
  - MCP preflight is recorded as benchmark execution metadata, not as a third scored response
  - Blocked preflight does not cancel the WITH-MCP run; it is surfaced explicitly in structured output and reporting
  - Fallback preflight is treated as degraded-but-runnable MCP coverage
  - The benchmark guide was aligned to the existing Claude Opus 4.6 model choice used by the orchestrator, skill, and reporter
metrics:
  completed: 2026-04-24
  tasks: 2
  files: 5
---

# Quick Task 260424-113051: Wire Benchmark Preflight Into OpenCode Workflow Summary

**One-liner:** Wired MCP preflight into the `.opencode` benchmark workflow and documented how ready, fallback, and blocked states flow through execution and reporting.

## What Was Done

### Task 1: Update benchmark agent contracts

- `benchmark-executor` now instructs the executor to run MCP preflight immediately before the WITH-MCP run
- Added a structured `mcp_preflight` result contract with `status`, `runnable`, `summary`, blocked tools, fallback tools, and raw result fields
- `benchmark-orchestrator` now passes preflight expectations to the executor and preserves `mcp_preflight` in collected benchmark data
- `benchmark-reporter` now includes an MCP Preflight section in each prompt result and calls out blocked/fallback states explicitly

### Task 2: Align nearby benchmark docs

- Updated `.opencode/benchmark/guide.md` with the MCP preflight step and ready/fallback/blocked semantics
- Updated the `rag-benchmark` skill so preflight is described as execution metadata that preserves the existing scoring protocol
- Aligned the benchmark guide model list with the existing `Claude Opus 4.6` benchmark selection used elsewhere in the workflow

## Verification

- Reviewed the touched benchmark files for a consistent `mcp_preflight` contract
- Confirmed the benchmark protocol still preserves the same scored A/B run order: WITHOUT MCP, then WITH MCP

## Known Limits

- These changes update workflow instructions and documentation only; they do not execute a live benchmark run
