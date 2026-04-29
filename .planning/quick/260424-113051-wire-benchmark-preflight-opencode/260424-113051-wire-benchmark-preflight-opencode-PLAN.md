---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .opencode/agents/benchmark-executor.md
  - .opencode/agents/benchmark-orchestrator.md
  - .opencode/agents/benchmark-reporter.md
  - .opencode/benchmark/guide.md
  - .opencode/skills/rag-benchmark/SKILL.md
autonomous: true
requirements: []
must_haves:
  truths:
    - 'Benchmark executor performs MCP preflight before the WITH-MCP run'
    - 'Executor/orchestrator/reporter preserve preflight status in structured benchmark output'
    - 'Blocked and fallback MCP states are handled explicitly without changing the underlying A/B benchmark order'
  artifacts:
    - path: .opencode/agents/benchmark-executor.md
      provides: 'Executor instructions for MCP preflight and structured preflight result reporting'
    - path: .opencode/agents/benchmark-orchestrator.md
      provides: 'Orchestrator contract including MCP preflight result propagation'
    - path: .opencode/benchmark/guide.md
      provides: 'Benchmark workflow documentation for ready/fallback/blocked preflight states'
  key_links:
    - from: .opencode/agents/benchmark-executor.md
      to: .opencode/agents/benchmark-orchestrator.md
      via: 'mcp_preflight structured output contract'
      pattern: 'mcp_preflight'
    - from: .opencode/benchmark/guide.md
      to: .opencode/skills/rag-benchmark/SKILL.md
      via: 'shared ready/fallback/blocked vocabulary'
      pattern: 'fallback'
---

<objective>
Wire benchmark preflight into the `.opencode` benchmark workflow without changing the existing A/B benchmark protocol.

Purpose: Benchmarks should explicitly record whether MCP retrieval was ready, degraded to fallback, or blocked before the WITH-MCP run so reports can distinguish RAG quality from tool-availability issues.

Output: Updated benchmark agents and nearby docs that describe preflight execution, structured reporting, and blocked/fallback handling.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Update benchmark agent contracts</name>
  <files>
    .opencode/agents/benchmark-executor.md,
    .opencode/agents/benchmark-orchestrator.md,
    .opencode/agents/benchmark-reporter.md
  </files>
  <behavior>
    - Executor runs MCP preflight before the WITH-MCP run
    - Orchestrator passes through `mcp_preflight` structured data
    - Reporter includes preflight status in per-prompt reporting
  </behavior>
</task>

<task type="auto">
  <name>Task 2: Align nearby benchmark docs</name>
  <files>
    .opencode/benchmark/guide.md,
    .opencode/skills/rag-benchmark/SKILL.md
  </files>
  <behavior>
    - Document ready/fallback/blocked preflight states
    - Preserve the existing benchmark run order and protocol
    - Keep benchmark model references internally consistent
  </behavior>
</task>

</tasks>

<verification>
- Review the touched benchmark files for a consistent `mcp_preflight` contract
- Confirm docs all describe the same ready/fallback/blocked semantics
</verification>

<success_criteria>

- Benchmark executor instructions include MCP preflight before WITH-MCP
- Structured benchmark output includes preflight result fields
- Benchmark docs and agent instructions consistently describe blocked/fallback handling
  </success_criteria>
