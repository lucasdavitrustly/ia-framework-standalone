# AGENTS.md

## Project Purpose

This skill (`mcp-bench`) provides three IDE-agnostic commands to benchmark the
ia-framework MCP: two capture commands (with / without MCP) and one blind-judge
command that emits a human-readable HTML report.

## Available Commands

- `/mcp-bench-run "<prompt>"` — Capture a run **with** the ia-framework MCP.
- `/mcp-bench-baseline "<prompt>"` — Capture a run **without** any ia-framework MCP.
- `/mcp-bench-judge [prompt-slug]` — Blind-judge all reports for a slug; emit markdown + HTML.

## Example

```
/mcp-bench-run "How are payment entries persisted?"
/mcp-bench-baseline "How are payment entries persisted?"
/mcp-bench-judge how-are-payment-entries-persisted
```

## Reports Directory

- All reports are written to `./mcp-bench-reports/` at the project root.
- This directory is git-ignored — reports live only in the local environment.
- Filename convention: `<model-slug>__<prompt-slug>__<mcp|baseline>__<UTC-ISO>.md`
- Judgment outputs: `_judgment__<prompt-slug>__<UTC-ISO>.md` and `.html`

## CRITICAL: Statelessness & Deletion Semantics

- There is **NO manifest, NO database, NO cached count**. Always derive state
  from a live `glob` of `mcp-bench-reports/` at the moment the command runs.
- A report deleted by the user is simply not globbed → not counted → not judged.
  This is the only "erase" mechanism. Never track deleted files.
- The judge MUST exclude files matching `_judgment__*` from its capture-report glob
  so prior judgment outputs are never counted as input reports.
- Re-running the same prompt ADDS a new timestamped report; never overwrite.

## Deterministic Slug Rule

Compute `prompt_slug` identically in every command so the same prompt pairs up:

1. Trim and collapse all whitespace to single spaces.
2. Lowercase.
3. Strip punctuation (keep `a-z`, `0-9`, spaces).
4. Replace spaces with hyphens.
5. Truncate to 60 characters; trim trailing hyphen.

Always echo the computed slug to the user after a capture run.

## Metric Sources

- **Latency**: wall-clock time the agent measures around the run; per-tool
  `durationMs` from the MCP request log.
- **MCP tokens / duration (exact)**: dashboard API request log —
  `GET http://localhost:${DASHBOARD_PORT:-3000}/api/requests/stats?from=<start>&to=<end>`
  and `GET .../api/requests?from=<start>&to=<end>`. Graceful `N/A` if the API
  is not running.
- **Session tokens (best-effort)**: the agent self-reports its own prompt/response
  token usage when available; otherwise mark `N/A`.
- **Cost**: `tokens × price` from `references/model-pricing.json`. Unknown model → `N/A`.
- **Model**: parsed from the `---LLM-IDENTITY---` block the run emits.

## LLM-IDENTITY Block

Every capture run MUST end its response with this block so the model can be
identified later:

```
---LLM-IDENTITY---
Model: <model id>
Provider: <provider>
Temperature: <temperature or "unknown">
---END-IDENTITY---
```

## MCP Server Tool Priority (for the `run` command)

1. `ia-framework_search_codebase` — semantic search
2. `ia-framework_get_file` — specific file retrieval
3. `ia-framework_get_dependencies` — dependency graph

The `baseline` command MUST NOT call any `ia-framework_*` tool — use only native
read / grep / glob.

## Rules

- Capture commands never score quality — that is the judge's job (blind).
- Judge scores blind: strip model identity and the mcp_enabled flag before scoring.
- Judge requires ≥1 MCP run AND ≥1 baseline run for the slug, or it halts with guidance.
- All report and HTML output is local-only; never commit `mcp-bench-reports/`.
