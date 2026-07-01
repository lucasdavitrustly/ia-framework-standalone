<!--
  Markdown comparison report written by /mcp-bench-judge to
  mcp-bench-reports/_judgment__{{PROMPT_SLUG}}__{{TIMESTAMP_ISO}}.md
  Substitute every {{PLACEHOLDER}}.
-->

# mcp-bench judgment — {{PROMPT_SLUG}}

**Prompt:** {{PROMPT_PLAIN}}

**Judged:** {{TIMESTAMP_ISO}} · **Reports scored:** {{TOTAL_REPORTS}} ({{MCP_COUNT}} MCP, {{BASELINE_COUNT}} baseline)

## Verdict

- **Best overall:** {{WINNER_LABEL}}
- **Worst overall:** {{LOSER_LABEL}}
- **MCP vs baseline quality delta:** {{QUALITY_DELTA}} (avg MCP {{AVG_MCP_QUALITY}} − avg baseline {{AVG_BASELINE_QUALITY}})

{{VERDICT_NARRATIVE}}

## Ranking (best → worst)

| Rank | Model | MCP? | Quality | Latency (ms) | Tokens | Cost (USD) |
| ---- | ----- | ---- | ------- | ------------ | ------ | ---------- |

{{RANKING_ROWS}}

## Blind scores (per run)

{{BLIND_SCORE_BLOCKS}}

<!--
  Each run block follows this shape:

  ### Run {{LABEL}} → {{MODEL}} ({{MCP_LABEL}})
  - Correctness: X/10 — justification
  - Grounding/Citations: X/10 — justification
  - Completeness: X/10 — justification
  - Relevance: X/10 — justification
  - **Aggregate: X.X/10**

  ✅ What was good: ...
  ⚠️ What was not good: ...
-->

## Notes

- Scores were assigned blind (model identity and MCP flag hidden during scoring).
- Quality is judge-assessed against the fixed rubric, not ground-truth correctness.
- Cost basis: `model-pricing.json@v1`. Unknown models report cost as N/A.
