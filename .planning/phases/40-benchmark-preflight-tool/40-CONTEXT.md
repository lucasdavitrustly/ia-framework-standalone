# Phase 40: Benchmark Preflight Tool - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

A `benchmark_preflight` MCP tool validates that all required benchmark tools are callable before a run starts. The benchmark CLI calls preflight before each run and aborts with a clear message on failure.

**Note:** BPF-01, BPF-02, BPF-03 are already implemented. The `benchmark_preflight` tool exists in `packages/mcp-server/src/tools/benchmark-preflight.ts`, is registered, probes tools, and returns structured pass/fail reports. The remaining work is BPF-04 (CLI integration) plus expanding the tool list.

Package: `packages/benchmark` + `packages/mcp-server`

</domain>

<decisions>
## Implementation Decisions

### Preflight tool scope

- **D-01:** Expand from 3 to 5 tools. Add `get_module_dependencies` and `query_database` to the existing `search_codebase`, `search_codebase_hybrid`, `get_file`.
- **D-02:** The 2 new tools are marked `required: false` — they appear in the preflight report but do NOT block the benchmark run if unavailable. Only the original 3 tools are blocking.
- **D-03:** Update `DEFAULT_BENCHMARK_TOOL_REQUIREMENTS` in both `packages/mcp-server/src/tools/benchmark-preflight.ts` and `packages/benchmark/src/mcp-preflight.ts` to include the 2 new entries.

### CLI abort behavior

- **D-04:** Benchmark CLI calls preflight before starting any run. If any required tool is blocked (`status: 'blocked'` and `required: true`), abort with a non-zero exit code and a detailed error table showing each tool's status and failure reason.
- **D-05:** Add `--skip-preflight` flag to the benchmark CLI to bypass the preflight check entirely. When used, log a warning but proceed.
- **D-06:** On success (all required tools ready): print a single summary line (e.g., "Preflight: 5/5 tools ready") and continue. No verbose table on pass.
- **D-07:** On failure: print full per-tool table showing tool name, status (ready/fallback/blocked), required flag, and error reason for blocked tools. Then abort.

### Agent's Discretion

- Exact probe queries for `get_module_dependencies` and `query_database`
- Error message formatting and exit code value
- Whether to deduplicate the `DEFAULT_BENCHMARK_TOOL_REQUIREMENTS` between the two packages or keep them separate
- Test fixture design

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing preflight implementation

- `packages/mcp-server/src/tools/benchmark-preflight.ts` — MCP tool registration, handler, probing logic, report formatting (BPF-01/02/03 already done)
- `packages/benchmark/src/mcp-preflight.ts` — `evaluateBenchmarkPreflight()` evaluation logic, `DEFAULT_BENCHMARK_TOOL_REQUIREMENTS`
- `packages/benchmark/src/mcp-preflight.test.ts` — Existing preflight tests
- `packages/mcp-server/src/server.test.ts` — Server-level preflight registration and handler tests

### Benchmark runner (CLI integration target)

- `packages/benchmark/src/benchmark-runner.ts` — `BenchmarkRunner.run()` — where preflight call needs to be added before query execution
- `packages/benchmark/src/types.ts` — Shared types for preflight reports, tool capabilities, probes

### Requirements

- `.planning/milestones/v1.6-REQUIREMENTS.md` — BPF-01 through BPF-04

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `benchmarkPreflightHandler()` in `packages/mcp-server/src/tools/benchmark-preflight.ts:127` — Full MCP handler, already probes 3 tools and returns `BenchmarkPreflightReport`
- `evaluateBenchmarkPreflight()` in `packages/benchmark/src/mcp-preflight.ts:76` — Pure evaluation logic, takes probes + requirements, returns report
- `PreflightEngine` type in benchmark-preflight.ts:6 — Engine interface for probing (search, searchWithExpansion, searchHybrid, getFile)
- `BenchmarkPreflightReport` type — `{ runnable, readyCount, fallbackCount, blockedCount, summary, tools[] }`

### Established Patterns

- Tool probing via `probeTool()` — wraps async call in try/catch, returns `{ tool, available, callable, reason }`
- Requirements-based evaluation — each tool has `required: boolean` and optional `fallbackTool`
- Status classification: `ready` (primary works), `fallback` (primary failed, fallback works), `blocked` (both failed)

### Integration Points

- `BenchmarkRunner.run()` — preflight call should go at the top, before the query loop
- `PreflightEngine` interface needs `getModuleDependencies()` and `queryDatabase()` methods for the 2 new probes
- `DEFAULT_BENCHMARK_TOOL_REQUIREMENTS` array — add 2 new entries

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 40-benchmark-preflight-tool_
_Context gathered: 2026-05-15_
