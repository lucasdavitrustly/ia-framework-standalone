---
name: mcp-bench-run
description: >
  Capture a benchmark run of a prompt WITH the ia-framework MCP enabled.
  Times the run, records token usage and cost, identifies the model, and writes
  a timestamped report under ia-framework's .ia-framework/mcp-bench-reports/. Pair with /mcp-bench-baseline
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

## 3. Record the start time and the token start-snapshot

- `T_START` = current UTC time, both as ISO 8601 and epoch milliseconds.
  Use bash: `date -u +%Y-%m-%dT%H:%M:%SZ` and `date +%s%3N` (fallback
  `python3 -c 'import time;print(int(time.time()*1000))'` on macOS if `%3N`
  is unsupported).
- Capture the session token **start snapshot** now (see
  `references/session-tokens.md`): resolve the current session id `SID` (most
  recently updated `session` row whose `directory` = `<CWD>`), then read the
  assistant-message token sums into `IN0` / `OUT0`. If the DB/`sqlite3`/session
  is unavailable, mark the snapshot unavailable and proceed (session tokens
  degrade to `N/A` later).

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

- Read `MODEL` and `PROVIDER` from the DB end-snapshot (`MAX(modelID)` /
  `MAX(providerID)` of this session's assistant messages — see
  `references/session-tokens.md`). If the DB is unavailable, fall back to your
  own self-knowledge.
- `TEMPERATURE` is not stored in the DB → `unknown`.
- These populate the `---LLM-IDENTITY---` block and the front-matter.
- If you cannot determine a field, write `unknown`.

## 8. Session tokens (DB delta)

- Capture the token **end snapshot** (`IN1` / `OUT1`) using the query in
  `references/session-tokens.md`.
- This run's tokens are the delta:
  - `SESSION_INPUT_TOKENS  = IN1 - IN0`
  - `SESSION_OUTPUT_TOKENS = OUT1 - OUT0`
- Graceful degradation → `N/A` for both if: `sqlite3` is missing, the DB is
  absent/unreadable, the session id was not resolved, or the delta is negative.
- NOTE: these are the agent's own session tokens (the delta for this run), kept
  distinct from the MCP token totals captured in step 6.

## 9. Compute cost

- Read `references/model-pricing.json` (resolve the skill's references dir).
- Match `MODEL` case-insensitively, allowing substring match in either direction
  (e.g. env model `bedrock-claude-opus-4-8` matches key `claude-opus-4.8`).
- `cost_usd = (SESSION_INPUT_TOKENS/1e6)*input_per_mtok + (SESSION_OUTPUT_TOKENS/1e6)*output_per_mtok`
  (input + output only — cache tokens are NOT priced). Round to 4 decimals.
- If the model is not found OR session token totals are `N/A`, set
  `cost_usd = "N/A"` and warn the user.

## 10. Write the report

- Resolve `REPORTS_DIR` per `references/reports-dir.md` (prefer
  `$IA_FRAMEWORK_DIR/mcp-bench-reports`; else derive
  `<skill_dir>/../../.ia-framework/mcp-bench-reports`). Ensure it exists
  (`mkdir -p "$REPORTS_DIR"`).
- Do NOT touch the benchmarked project's `.gitignore` — `REPORTS_DIR` lives under
  ia-framework's already-ignored `.ia-framework/` runtime dir.
- Build a model slug: same slug rule applied to `MODEL` (e.g. `claude-opus-4-8`).
- Filename: `$REPORTS_DIR/<model-slug>__<PROMPT_SLUG>__mcp__<T_START_ISO with : replaced by ->.md`.
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
4. Reports are local-only under ia-framework's `.ia-framework/` (git-ignored); never stage or commit them, and never edit the benchmarked project's `.gitignore`.
5. Degrade gracefully: a missing dashboard API or unknown model yields N/A, not failure.
6. Always end your response with the LLM-IDENTITY block.
7. Read the OpenCode DB with `sqlite3 -readonly` only — never write to it.
</constraints>
