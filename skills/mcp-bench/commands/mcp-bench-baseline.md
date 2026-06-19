---
name: mcp-bench-baseline
description: >
  Capture a benchmark run of a prompt WITHOUT any ia-framework MCP — using only
  native read/grep/glob tools. Times the run, records token usage and cost,
  identifies the model, and writes a timestamped report to ./mcp-bench-reports/.
  This is the no-MCP control for /mcp-bench-judge.
argument-hint: '"<prompt>"'
tools:
  read: true
  bash: true
  glob: true
  grep: true
  write: true
---

<objective>
Run the user's prompt (`$ARGUMENTS`) end-to-end **without using any ia-framework
MCP tool** — native file tools only. This is the baseline (control) half of an
MCP-vs-baseline comparison.

Do NOT score quality here — quality is judged later, blind, by /mcp-bench-judge.
</objective>

<process>

## 1. Parse and slugify the prompt

- `PROMPT = $ARGUMENTS` (strip surrounding quotes if present).
- If empty, tell the user the prompt is required and stop.
- Compute `PROMPT_SLUG` using the deterministic slug rule (see AGENTS.md) —
  IDENTICAL to /mcp-bench-run so the same prompt produces the same slug.
- Echo the slug to the user: `slug: <PROMPT_SLUG>`.

## 2. Record the start time

- `T_START` = current UTC time, ISO 8601 + epoch milliseconds (see /mcp-bench-run
  step 3 for the bash commands).

## 3. Answer the prompt with NATIVE TOOLS ONLY

- **HARD RULE: do NOT call any `ia-framework_*` MCP tool.** No exceptions.
- For any codebase context use only: `glob`, `grep`, `read`.
- Produce a complete, well-grounded answer. Cite file paths / evidence where
  relevant — grounding is one of the judged dimensions.
- Keep the full answer text; it becomes the report's Response section.

## 4. Record the end time and latency

- `T_END` = current UTC time (ISO + epoch ms).
- `LATENCY_MS_TOTAL = T_END_ms - T_START_ms`.

## 5. MCP metrics are all zero

- This is a no-MCP run: set `mcp.tool_calls = 0`, `mcp.input_tokens = 0`,
  `mcp.output_tokens = 0`, `mcp.avg_duration_ms = 0`.
- Do NOT call the dashboard API.

## 6. Identify the model

- Determine your own model id, provider, and temperature (`unknown` if not known).

## 7. Best-effort session tokens

- Report your session input/output token counts if you can introspect them;
  otherwise `N/A`.

## 8. Compute cost

- Read `references/model-pricing.json`; match `MODEL` case-insensitively with
  substring matching in either direction.
- `cost_usd = (input_tokens/1e6)*input_per_mtok + (output_tokens/1e6)*output_per_mtok`
  using session token totals. Round to 4 decimals.
- Unknown model OR `N/A` tokens → `cost_usd = "N/A"` + warning.

## 9. Write the report

- Ensure `./mcp-bench-reports/` exists (`mkdir -p`).
- Ensure `.gitignore` contains `mcp-bench-reports/`; append if missing.
- Model slug = slug rule applied to `MODEL`.
- Filename: `<model-slug>__<PROMPT_SLUG>__baseline__<T_START_ISO with : replaced by ->.md`.
- Render `references/report-template.md`, substituting every placeholder.
  Set `mcp_enabled: false` and `{{MCP_LABEL}} = baseline`.
- Write the file with the `write` tool.

## 10. Summary line

Print one line:
`✓ baseline run · model=<MODEL> · latency=<LATENCY_MS_TOTAL>ms · tokens=<in/out> · cost=<COST_USD> USD · slug=<PROMPT_SLUG>`
Then remind the user: ensure a matching `/mcp-bench-run` exists, then run
`/mcp-bench-judge <PROMPT_SLUG>`.

</process>

<constraints>
1. This command MUST NOT call any ia-framework MCP tool (mcp_enabled = false).
2. NEVER score quality here.
3. NEVER overwrite an existing report — the timestamp makes each filename unique.
4. Reports are local-only; never stage or commit them.
5. Degrade gracefully: unknown model yields N/A, not failure.
6. Always end your response with the LLM-IDENTITY block.
</constraints>
