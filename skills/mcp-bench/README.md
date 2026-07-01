# mcp-bench

Benchmark the **ia-framework MCP** on any prompt. Measure whether the MCP
improves a model's response versus a no-MCP baseline — and at what latency,
token, and dollar cost.

## What it measures

| Metric          | Source                                                                                 |
| --------------- | -------------------------------------------------------------------------------------- |
| **Latency**     | Wall-clock time of the run + per-tool `durationMs` from the MCP request log            |
| **Token usage** | Best-effort session self-report + exact ia-framework MCP tokens from the dashboard API |
| **Cost (USD)**  | `tokens × price` from `references/model-pricing.json`                                  |
| **Model**       | Parsed from a `---LLM-IDENTITY---` block emitted by the run                            |
| **Quality**     | Blind LLM-as-judge on a fixed rubric (judge command only)                              |

## Commands

```
/mcp-bench-run "<prompt>"        # capture WITH the ia-framework MCP
/mcp-bench-baseline "<prompt>"   # capture WITHOUT any ia-framework MCP
/mcp-bench-judge [prompt-slug]   # blind-judge + rank + HTML report
```

## How it works

1. Run the same prompt with `/mcp-bench-run` and `/mcp-bench-baseline`.
   Each writes a timestamped `.md` report to
   `<ia-framework-root>/.ia-framework/mcp-bench-reports/`.
2. Run `/mcp-bench-judge <slug>`. It globs all reports for that prompt, scores
   each response **blind** (model identity hidden) on a 4-dimension rubric,
   reveals the models, ranks best→worst, and emits a human-readable HTML report
   highlighting **what was good** and **what was not good** for each run.

## Reports & deletion

- Reports live only in `<ia-framework-root>/.ia-framework/mcp-bench-reports/`
  (git-ignored by ia-framework).
- There is no database or manifest — the folder is the single source of truth.
- To erase a report, just delete the file. The judge counts only what exists.
- Re-running a prompt adds a new report; the judge averages each side
  (MCP vs baseline) when computing the quality delta.

## Installation

Installed automatically by `ia-framework`'s `install-skills.sh` (run `./install.sh`
or `scripts/install-skills.sh`). The commands are symlinked into each selected
IDE's command directory, IDE-agnostically.

## Requires

- **ia-framework MCP** — the subject under test (the `run` command exercises it).
- **ia-framework dashboard API** (optional) — for exact MCP token/latency metrics.
  If not running, metrics degrade gracefully to `N/A`.
