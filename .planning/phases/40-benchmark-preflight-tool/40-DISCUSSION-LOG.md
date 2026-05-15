# Phase 40: Benchmark Preflight Tool - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 40-benchmark-preflight-tool
**Areas discussed:** Preflight scope expansion, CLI abort behavior

---

## Preflight Scope Expansion

| Option               | Description                                                                                  | Selected |
| -------------------- | -------------------------------------------------------------------------------------------- | -------- |
| Keep current 3 only  | Keep search_codebase, search_codebase_hybrid, get_file. Only ones benchmarks actually use.   |          |
| Add 2 more (5 total) | Add module_dependencies and query_database. More coverage but may not apply to all projects. | ✓        |
| All registered tools | Check ALL registered MCP tools dynamically. Future-proof but complex probing.                |          |

**User's choice:** Add 2 more (5 total)

### Follow-up: Required vs Optional

| Option               | Description                                                                      | Selected |
| -------------------- | -------------------------------------------------------------------------------- | -------- |
| Optional (warn only) | Mark as required: false. Report them but don't block the run. Only core 3 block. | ✓        |
| All required         | All 5 required. Run won't start if any fail.                                     |          |

**User's choice:** Optional (warn only)

---

## CLI Abort Behavior

| Option                    | Description                                                                                 | Selected |
| ------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| Hard abort + skip flag    | Default: abort with clear error listing blocked tools. Add --skip-preflight flag to bypass. | ✓        |
| Warn + prompt to continue | Print warning with blocked tools, ask for confirmation.                                     |          |
| Hard abort, no bypass     | Always abort, no way to bypass. Strictest.                                                  |          |

**User's choice:** Hard abort + skip flag

### Follow-up: Output Style

| Option                   | Description                                            | Selected |
| ------------------------ | ------------------------------------------------------ | -------- |
| Quiet pass, verbose fail | One-line summary on pass, detailed table on failure.   | ✓        |
| Always verbose           | Always show full per-tool table regardless of outcome. |          |

**User's choice:** Quiet pass, verbose fail

---

## Agent's Discretion

- Probe queries for new tools
- Error message formatting and exit code
- Deduplication of DEFAULT_BENCHMARK_TOOL_REQUIREMENTS between packages
- Test fixture design

## Deferred Ideas

None.
