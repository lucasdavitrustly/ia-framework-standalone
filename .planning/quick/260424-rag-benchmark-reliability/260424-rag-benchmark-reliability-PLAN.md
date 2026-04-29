---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/benchmark/src/types.ts
  - packages/benchmark/src/index.ts
  - packages/benchmark/src/mcp-preflight.ts
  - packages/benchmark/src/mcp-preflight.test.ts
  - packages/mcp-server/src/index.ts
  - packages/mcp-server/src/server.ts
  - packages/mcp-server/src/server.test.ts
  - packages/mcp-server/src/tools/benchmark-preflight.ts
  - packages/mcp-server/src/tools/search-codebase.ts
  - packages/mcp-server/src/tools/search-codebase-hybrid.ts
  - packages/mcp-server/src/tools/get-file.ts
  - packages/mcp-server/src/tools/get-dependencies.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - 'Benchmark code can evaluate MCP tool readiness before a run and distinguish ready, fallback, and blocked states'
    - 'MCP server exposes a benchmark preflight tool reporting retrieval-tool readiness and fallback paths'
    - 'MCP retrieval tools degrade to indexed evidence instead of surfacing empty tool-failure stubs when underlying retrieval calls fail'
  artifacts:
    - path: packages/benchmark/src/mcp-preflight.ts
      provides: 'Reusable benchmark preflight evaluation for MCP tool capability reports'
    - path: packages/mcp-server/src/tools/benchmark-preflight.ts
      provides: 'MCP-accessible preflight probe for required retrieval tools and fallback availability'
    - path: packages/mcp-server/src/tools/search-codebase.ts
      provides: 'Expansion-to-search fallback with evidence-backed response'
    - path: packages/mcp-server/src/tools/get-file.ts
      provides: 'get_file failure fallback to indexed search evidence'
  key_links:
    - from: packages/mcp-server/src/server.ts
      to: packages/mcp-server/src/tools/benchmark-preflight.ts
      via: 'registerBenchmarkPreflightTool()'
      pattern: 'benchmark_preflight'
    - from: packages/benchmark/src/mcp-preflight.ts
      to: packages/mcp-server/src/tools/benchmark-preflight.ts
      via: 'shared ready/fallback/blocked vocabulary'
      pattern: 'fallback'
---

<objective>
Process the benchmark report into a phased execution plan and deliver the first reliability increment: preflight validation plus permission-aware fallback for benchmarked MCP retrieval.

Purpose: The current benchmark is dominated by tool-access failures and procedural non-answers, so the first change must make tool readiness explicit and convert blocked retrieval paths into indexed evidence whenever possible.

Output: A phased plan for all five benchmark recommendations, plus shipped code and tests for the first increment in `packages/benchmark` and `packages/mcp-server`.
</objective>

<phases>

<phase>
  <name>Phase 1: Reliability Baseline</name>
  <scope>packages/benchmark, packages/mcp-server</scope>
  <deliverables>
    - Add reusable benchmark preflight evaluation in `packages/benchmark`
    - Add `benchmark_preflight` MCP tool that probes required retrieval tools and reports fallback coverage
    - Add indexed-evidence fallback paths for `search_codebase`, `search_codebase_hybrid`, `get_file`, and `get_dependencies`
  </deliverables>
  <verification>
    - `pnpm --filter @ia-framework/benchmark test -- --run`
    - `pnpm --filter @ia-framework/mcp-server test -- --run`
  </verification>
</phase>

<phase>
  <name>Phase 2: Java-Aware Retrieval Ranking</name>
  <scope>packages/core, packages/retrieval, packages/mcp-server</scope>
  <deliverables>
    - Add symbol-aware hybrid retrieval inputs for exact identifiers
    - Add module/package-aware reranking for entry points, controllers, repositories, configs, and exception handlers
    - Tune MCP search defaults for Java multi-module repositories
  </deliverables>
</phase>

<phase>
  <name>Phase 3: Anchors And Guardrails</name>
  <scope>packages/core, packages/mcp-server</scope>
  <deliverables>
    - Emit first-class file/symbol/line anchors in retrieval responses
    - Enforce answer guardrails requiring a conclusion plus cited evidence or an explicit insufficient-evidence response
  </deliverables>
</phase>

<phase>
  <name>Phase 4: Module-Aware Traversal</name>
  <scope>packages/core, packages/indexer, packages/retrieval</scope>
  <deliverables>
    - Add module-aware chunk metadata for architecture questions
    - Expand graph traversal around controller -> service -> repository/model flows
    - Tune architecture/data-flow query templates for cross-module tracing
  </deliverables>
</phase>

<phase>
  <name>Phase 5: Benchmark Revalidation</name>
  <scope>packages/benchmark plus benchmark workflow artifacts</scope>
  <deliverables>
    - Re-run the failing corpus slices with preflight enabled
    - Compare conversion of zero-token failures into evidence-backed answers
    - Use results to decide whether Phases 2-4 need additional indexing or prompt work
  </deliverables>
</phase>

</phases>

<progress>
- Phase 1 complete
- Phase 2 complete in this checkpoint
- Phase 3 complete in this checkpoint
- Phase 4 partially complete in this checkpoint: retrieval metadata and module-biased expansion shipped; chunking strategy changes and deeper graph templates remain
- Phase 5 not started
</progress>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add benchmark preflight evaluation primitives</name>
  <files>
    packages/benchmark/src/types.ts,
    packages/benchmark/src/index.ts,
    packages/benchmark/src/mcp-preflight.ts,
    packages/benchmark/src/mcp-preflight.test.ts
  </files>
  <behavior>
    - Evaluate required tools as `ready`, `fallback`, or `blocked`
    - Treat a blocked primary tool as runnable only when a declared fallback tool is callable
    - Produce summary fields benchmark orchestrators can log before execution
  </behavior>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Expose MCP benchmark preflight tool</name>
  <files>
    packages/mcp-server/src/tools/benchmark-preflight.ts,
    packages/mcp-server/src/server.ts,
    packages/mcp-server/src/index.ts,
    packages/mcp-server/src/server.test.ts
  </files>
  <behavior>
    - Register `benchmark_preflight` on every MCP server instance
    - Probe search/hybrid/file retrieval readiness using the underlying indexed engine
    - Report fallback availability for blocked or unavailable tools
  </behavior>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add indexed-evidence fallback to retrieval tools</name>
  <files>
    packages/mcp-server/src/tools/search-codebase.ts,
    packages/mcp-server/src/tools/search-codebase-hybrid.ts,
    packages/mcp-server/src/tools/get-file.ts,
    packages/mcp-server/src/tools/get-dependencies.ts,
    packages/mcp-server/src/server.test.ts
  </files>
  <behavior>
    - On expansion/hybrid/get-file failures, return best-effort indexed evidence instead of surfacing only the error
    - Preserve the failure note so callers know fallback was used
    - Keep successful paths unchanged except for shared formatting needed by fallback output
  </behavior>
</task>

</tasks>

<success_criteria>

- `packages/benchmark` exports a reusable MCP preflight evaluator with tests
- `packages/mcp-server` exposes a `benchmark_preflight` tool with coverage in tests
- Search/file/dependency MCP tools return evidence-backed fallback output when retrieval primitives fail
  </success_criteria>
