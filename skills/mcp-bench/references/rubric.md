# Quality Rubric (LLM-as-judge)

This rubric is used **only** by `/mcp-bench-judge`, applied **blind** — the model
identity and the `mcp_enabled` flag MUST be stripped before scoring.

## Dimensions

Score each dimension from **1** (worst) to **10** (best). Provide a one-sentence
written justification for each score, citing concrete evidence from the response.

| #   | Dimension                 | Weight | What to assess                                                                                                                                |
| --- | ------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Correctness**           | 0.35   | Is the answer factually and technically correct? Are statements about the codebase accurate? Penalize hallucinated APIs, files, or behavior.  |
| 2   | **Grounding / Citations** | 0.30   | Are claims backed by concrete evidence — real file paths, line numbers, code snippets, or external sources? Unsupported assertions score low. |
| 3   | **Completeness**          | 0.20   | Does the response fully address every part of the prompt? Are edge cases and caveats covered? Penalize partial answers.                       |
| 4   | **Relevance**             | 0.15   | Does it stay on task with no filler, no off-topic content, no padding? Concise and focused scores high.                                       |

## Aggregate score

```
quality = 0.35*correctness + 0.30*grounding + 0.20*completeness + 0.15*relevance
```

Report the aggregate to one decimal place (range 1.0–10.0).

## Scoring discipline

- **Be blind.** Do not infer which run used the MCP. Score the text on its merits.
- **Be specific.** Every score needs evidence: quote or reference the part of the
  response that justifies it.
- **Be consistent.** Apply the same standard to every labeled run (A, B, C, …).
- **Separate quality from cost.** Quality scoring ignores latency, tokens, and
  cost — those are objective metrics merged in only at the synthesis step.

## What-was-good / what-was-not-good extraction

For the HTML report, distill each run's scores into two short lists:

- **✅ What was good** — the dimensions/aspects that scored high, with the reason.
- **⚠️ What was not good** — the dimensions/aspects that scored low, with the reason.

These come directly from the per-dimension justifications above.
