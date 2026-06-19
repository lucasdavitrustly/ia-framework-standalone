---
name: mcp-bench-run
description: >
  Capture a benchmark run of a prompt WITH the ia-framework MCP enabled.
  Times the run, records token usage and cost, identifies the model, and writes
  a timestamped report to ./mcp-bench-reports/. Pair with /mcp-bench-baseline
  (same prompt) and compare via /mcp-bench-judge.
argument-hint: '"<prompt>"'
tools:
  read: true
  bash: true
  glob: true
  grep: true
  write: true
  webfetch: true
---

<objective>
Run the user's prompt (`$ARGUMENTS`) end-to-end **using the ia-framework MCP**,
measure its performance, and write a capture report. This is the MCP-enabled
half of an MCP-vs-baseline comparison.

Do NOT score quality here — quality is judged later, blind, by /mcp-bench-judge.
</objective>

<process>

## 1. Parse and slugify the prompt

- `PROMPT = $ARGUMENTS` (strip surrounding quotes if present).
- If empty, tell the user the prompt is required and stop.
- Compute `PROMPT_SLUG` using the deterministic slug rule (see AGENTS.md):
  trim → collapse whitespace → lowercase → strip punctuation → spaces to
  hyphens → truncate to 60 chars → trim trailing hyphen.
- Echo the slug to the user: `slug: <PROMPT_SLUG>`.

## 2. Preflight the MCP

- Issue a tiny `ia-framework_search_codebase` probe (e.g. the first few words of
  the prompt, `limit: 1`).
- If the MCP is unreachable, warn the user that this run cannot exercise the MCP
  and ask whether to continue as a degraded run or stop. If continuing, set
  `mcp_tool_calls = 0` and note the degradation in the report body.

## 3. Record the start time

- `T_START` = current UTC time, both as ISO 8601 and epoch milliseconds.
  Use bash: `date -u +%Y-%m-%dT%H:%M:%SZ` and `date +%s%3N` (fallback
  `python3 -c 'import time;print(int(time.time()*1000))'` on macOS if `%3N`
  is unsupported).

## 4. Answer the prompt USING the MCP

- Answer `PROMPT` as you normally would, but you MUST prefer the ia-framework
  MCP tools for any codebase context:
  1. `ia-framework_search_codebase`
  2. `ia-framework_get_file`
  3. `ia-framework_get_dependencies`
- Produce a complete, well-grounded answer. Cite file paths / evidence where
  relevant — grounding is one of the judged dimensions.
- Keep the full answer text; it becomes the report's Response section.

## 5. Record the end time and latency

- `T_END` = current UTC time (ISO + epoch ms).
- `LATENCY_MS_TOTAL = T_END_ms - T_START_ms`.

## 6. Pull exact MCP metrics from the dashboard API

- Base URL: `http://localhost:${DASHBOARD_PORT:-3000}`.
- `GET /api/requests/stats?from=<T_START_ISO>&to=<T_END_ISO>` → read
  `summary.totalInputTokens`, `summary.totalOutputTokens`, `summary.avgDurationMs`,
  `summary.totalRequests`.
- Use `bash` with `curl -s --max-time 5`. If the call fails or returns non-200,
  set every `mcp.*` field to `N/A` and note "dashboard API unavailable" in the
  report body. Do NOT fail the command.
- Map results: `MCP_TOOL_CALLS = totalRequests`, `MCP_INPUT_TOKENS`,
  `MCP_OUTPUT_TOKENS`, `MCP_AVG_DURATION_MS`.

## 7. Identify the model

- Determine your own model id, provider, and temperature.
- These populate the `---LLM-IDENTITY---` block and the front-matter.
- If you cannot determine a field, write `unknown`.

## 8. Best-effort session tokens

- Report your session input/output token counts if you can introspect them;
  otherwise `N/A`.

## 9. Compute cost

- Read `references/model-pricing.json` (resolve the skill's references dir).
- Match `MODEL` case-insensitively, allowing substring match in either direction
  (e.g. env model `bedrock-claude-opus-4-8` matches key `claude-opus-4.8`).
- `cost_usd = (input_tokens/1e6)*input_per_mtok + (output_tokens/1e6)*output_per_mtok`,
  using the best available token totals (session tokens preferred; otherwise the
  MCP token totals). Round to 4 decimals.
- If the model is not found OR token totals are `N/A`, set `cost_usd = "N/A"` and
  warn the user.

## 10. Write the report

- Ensure `./mcp-bench-reports/` exists (`mkdir -p`).
- Ensure `.gitignore` contains a `mcp-bench-reports/` line; append it if missing.
- Build a model slug: same slug rule applied to `MODEL` (e.g. `claude-opus-4-8`).
- Filename: `<model-slug>__<PROMPT_SLUG>__mcp__<T_START_ISO with : replaced by ->.md`.
- Render `references/report-template.md`, substituting every placeholder.
  Set `mcp_enabled: true` and `{{MCP_LABEL}} = MCP`.
- Write the file with the `write` tool.

## 11. Summary line

Print one line:
`✓ mcp run · model=<MODEL> · latency=<LATENCY_MS_TOTAL>ms · tokens=<in/out> · cost=<COST_USD> USD · slug=<PROMPT_SLUG>`
Then remind the user: run `/mcp-bench-baseline "<same prompt>"` then
`/mcp-bench-judge <PROMPT_SLUG>`.

</process>

<constraints>
1. This command MUST exercise the ia-framework MCP (mcp_enabled = true).
2. NEVER score quality here.
3. NEVER overwrite an existing report — the timestamp makes each filename unique.
4. Reports are local-only; never stage or commit them.
5. Degrade gracefully: a missing dashboard API or unknown model yields N/A, not failure.
6. Always end your response with the LLM-IDENTITY block.
</constraints>
