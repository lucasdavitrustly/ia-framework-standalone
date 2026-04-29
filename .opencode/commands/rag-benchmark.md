---
description: Run A/B benchmark comparing LLM responses with and without RAG MCP
agent: benchmark-orchestrator
subtask: false
---

Run a complete RAG benchmark comparing LLM responses with and without the
ia-framework MCP server enabled. Measure response time, token usage, and
response quality across multiple dimensions.

If arguments are provided, use them as a single prompt to benchmark.
If no arguments are provided, load the corpus from `.opencode/benchmark/corpus.json`.

$ARGUMENTS
