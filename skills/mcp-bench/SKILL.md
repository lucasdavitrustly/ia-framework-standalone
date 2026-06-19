---
name: mcp-bench
description: Benchmark the ia-framework MCP on a user prompt — capture latency, token usage, cost (USD), and model, then blind-judge responses on a fixed quality rubric and emit a human-readable HTML report. Use when you want to measure whether the ia-framework MCP improves a model's response versus a no-MCP baseline.
---

<what-this-is>

`mcp-bench` is a benchmarking skill that answers one question:
**does the ia-framework MCP make a model's response better, and at what cost?**

It does this by running the same prompt two ways — once **with** the ia-framework
MCP and once **without** it (a native-tools baseline) — capturing objective
metrics for each run, then blind-judging the responses on a fixed quality rubric.

</what-this-is>

<commands>

| Command                          | What it does                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/mcp-bench-run "<prompt>"`      | Capture a run **with** the ia-framework MCP. Writes a report with `mcp_enabled: true`.                                  |
| `/mcp-bench-baseline "<prompt>"` | Capture a run **without** any ia-framework MCP (native read/grep/glob only). Writes a report with `mcp_enabled: false`. |
| `/mcp-bench-judge [prompt-slug]` | Blind-judge all reports for a slug, rank best→worst, reveal model identities, and emit a markdown + HTML comparison.    |

</commands>

<metrics-captured>

Each capture run records:

- **Latency** — total wall-clock time of the run, plus per-MCP-tool `durationMs`.
- **Token usage** — best-effort session token self-report, plus the exact
  ia-framework MCP token cost read from the dashboard API request log.
- **Cost (USD)** — `tokens × price` using `references/model-pricing.json`.
- **Model** — parsed from a `---LLM-IDENTITY---` block emitted by the run.
- **Quality** — NOT scored at capture time; scored later by the judge command
  (blind, on a fixed rubric) to avoid self-assessment bias.

</metrics-captured>

<core-principles>

## 1. The folder is the single source of truth

All reports live in `./mcp-bench-reports/` (git-ignored). There is **no manifest,
no database, no cached counts**. Every command derives state from a live `glob`
of that folder at the moment it runs.

## 2. Deletion is the erase mechanism

To erase a report, the user simply deletes the `.md` file (any tool: `rm`, Finder,
IDE explorer). A deleted report is not globbed → not counted → not judged. There
is no separate "erase" command and nothing to clean up.

## 3. Re-running accumulates

Report filenames embed a timestamp, so re-running the same prompt **adds** a new
report rather than overwriting. A slug can accumulate several MCP and several
baseline reports. The judge scores every report it finds and averages each side.

## 4. Deterministic slug

Identical prompt text always produces the same `prompt_slug`, so an MCP run and a
baseline run of the same prompt pair up automatically. Each capture command echoes
the computed slug so the user can reuse it for the judge.

</core-principles>

<typical-workflow>

```
/mcp-bench-run "How are payment entries persisted?"
   → writes claude-opus-4-8__how-are-payment-entries-persisted__mcp__<ts>.md
   → echoes slug: how-are-payment-entries-persisted

/mcp-bench-baseline "How are payment entries persisted?"
   → writes claude-opus-4-8__how-are-payment-entries-persisted__baseline__<ts>.md

/mcp-bench-judge how-are-payment-entries-persisted
   → blind-scores both, reveals, ranks, writes:
       _judgment__how-are-payment-entries-persisted__<ts>.md
       _judgment__how-are-payment-entries-persisted__<ts>.html
```

</typical-workflow>
