# RAG Benchmark — Execution Guide

## Provider

All benchmark executions use **GitHub Copilot** as the provider.

The `opencode run` model flag format is: `github-copilot/<model-id>`

## Available Models

| Model ID          | Full Flag                        | Description                                  |
| ----------------- | -------------------------------- | -------------------------------------------- |
| `gpt-5.4`         | `github-copilot/gpt-5.4`         | OpenAI GPT 5.4 via GitHub Copilot            |
| `claude-opus-4.6` | `github-copilot/claude-opus-4.6` | Anthropic Claude Opus 4.6 via GitHub Copilot |

## Question Tool Options

When asking the user which model to benchmark, present ONLY these two options:

```
Question: "Which model should run this benchmark?"
Options:
  1. "GPT 5.4"         — OpenAI GPT 5.4 via GitHub Copilot
  2. "Claude Opus 4.6"  — Anthropic Claude Opus 4.6 via GitHub Copilot
```

Do NOT present providers, do NOT list other models, do NOT combine them.
The user picks ONE model. Both runs (with MCP and without MCP) use that same model.

## MCP Preflight

Before the WITH-MCP benchmark run, the executor must perform an MCP preflight check by invoking
`benchmark_preflight` through the default MCP-enabled benchmark environment.

The benchmark still runs in the same order and with the same prompt/model pairing:

1. WITHOUT MCP
2. MCP preflight
3. WITH MCP

Preflight status meanings:

- `ready`: required benchmark MCP tools are callable without degradation
- `fallback`: benchmark is runnable, but one or more MCP tools rely on fallback coverage
- `blocked`: benchmark MCP coverage is not fully runnable; the WITH-MCP run still proceeds, but the blocked state must be reported

The executor and report must preserve the preflight result as structured data. Do not silently treat blocked or fallback states as a normal MCP pass.
