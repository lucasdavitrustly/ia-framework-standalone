# Research: GSD-RAG Integration — CLI vs MCP Comparison

**Date:** 2026-04-02
**Phase:** 10 — Advanced Retrieval & Workflow Integration
**Requirements:** WKFL-01, WKFL-02, WKFL-03

## Comparison Table

| # | Dimension | MCP `search_codebase` | CLI `ia-framework search` | Winner |
|---|-----------|----------------------|--------------------------|--------|
| 1 | Token cost per fetch | ~30-50 input tokens (tool_use block) + ~2000-3000 result tokens (full content). Tool defs add ~100 tokens once per session. | ~20-30 input tokens (bash command) + ~2500-3500 result tokens (400-char truncated + decorative separators). | MCP |
| 2 | Call count overhead | 1 tool call per query. Additionally: get_file and get_dependencies are free follow-up tools. | 1 bash call per query. Getting file contents or dependencies requires separate subprocess invocations. | MCP |
| 3 | Latency | ~50-200ms. MCP server is persistent (StdioServerTransport) — no startup cost. | ~300-800ms cold start (fork + exec Node.js + load deps) + ~50-200ms search. | MCP |
| 4 | Context quality | Full code content with language-tagged code blocks, similarity scores, matched vector type, chunk names, file paths. | Truncated to 400 chars per result. Visual separators waste tokens. Not optimized for model consumption. | MCP |
| 5 | Result size control | `limit` + `score_threshold` params directly on tool schema. Model controls both per-query. | `--limit` + `--threshold` flags. Output truncation hardcoded at 400 chars. | MCP |
| 6 | GSD integration naturalness | Completely native. Model sees tool in inventory, invokes as part of reasoning loop. Same pattern as read, grep, edit. | Requires model to construct bash commands, remember binary name, parse unstructured stdout. | MCP |
| 7 | Setup complexity | One entry in opencode.json under mcp key. install.sh already configures this. | Requires ia-framework in PATH + IA_FRAMEWORK_CONFIG env var. | MCP |
| 8 | Reliability | High. MCP server managed by OpenCode lifecycle. No shell env, no PATH resolution. | Medium. Depends on PATH, Node.js version, env vars. | MCP |
| 9 | Batch query support | Model can issue multiple parallel tool calls in a single turn. | Sequential by default. Backgrounding mixes stdout. | MCP |
| 10 | Error visibility | Structured CallToolResult with isError flag. | stderr may be captured or lost. process.exit(1) signals failure. | MCP |
| 11 | Target project isolation | Config via IA_FRAMEWORK_CONFIG env var in MCP server config. | Same config resolution. | Tie |
| 12 | Token optimization | Model naturally decides when to invoke. Can use limit:3 vs limit:10. | Same potential but less ergonomic. | MCP |

**Final score: MCP 11 — Tie 1 — CLI 0**

## Recommendation

**Use MCP tools as the primary RAG integration for GSD workflows.**

Rationale:
1. The MCP server is already built and deployed as a persistent stdio process
2. Three tools for one server: search_codebase, get_file, get_dependencies
3. No content truncation — full code context vs CLI's 400-char previews
4. Native tool-use is how models reason — no context switching to "shell scripting" mode
5. Parallel queries are free (standard MCP protocol)

**CLI role:** Human debugging, CI pipelines, scripting — not AI-driven GSD workflows.

## WKFL-03 Verification

**Status: SATISFIED — no implementation required.**

| Claim | Evidence |
|-------|----------|
| OpenCode supports online LLMs | 75+ providers: Anthropic, OpenAI, Google, xAI, DeepSeek, OpenRouter, etc. |
| Model selection is user-controlled | OpenCode config: `"model": "anthropic/claude-sonnet-4-20250514"`. Runtime switchable via `/models`. |
| GSD workflows use the active model | GSD commands are OpenCode custom commands. They execute in the current agent's context. |
| ia-framework imposes no model constraint | All tool implementations use no LLM calls. Framework provides tools only. |
| Local+online coexistence | Ollama for embeddings (local). Reasoning model is separate (OpenCode's model config). |

## Implementation

RAG guidance is injected into the **target project's** AGENTS.md/CLAUDE.md via `ia-framework agents inject`. The framework is the provider — the target project's agent docs are where AI assistants find the guidance.
