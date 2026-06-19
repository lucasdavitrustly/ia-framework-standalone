---
name: mcp-bench-baseline
description: >
  Capture a benchmark run of a prompt WITHOUT any ia-framework MCP — using only
  native read/grep/glob tools. Times the run, records token usage and cost,
  identifies the model, and writes a timestamped report under ia-framework's .ia-framework/mcp-bench-reports/.
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

## 2. Record the start time and the token start-snapshot

- `T_START` = current UTC time, ISO 8601 + epoch milliseconds (see /mcp-bench-run
  step 3 for the bash commands).
- Capture the session token **start snapshot** now (see
  `references/session-tokens.md`): resolve the current session id `SID` (most
  recently updated `session` row whose `directory` = `<CWD>`), then read the
  assistant-message token sums into `IN0` / `OUT0`. If the DB/`sqlite3`/session
  is unavailable, mark the snapshot unavailable and proceed (tokens degrade to
  `N/A` later).

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

- Read `MODEL` and `PROVIDER` from the DB end-snapshot (`MAX(modelID)` /
  `MAX(providerID)` of this session's assistant messages — see
  `references/session-tokens.md`). If the DB is unavailable, fall back to your
  own self-knowledge.
- `TEMPERATURE` is not stored in the DB → `unknown` (write `unknown` for any
  field you cannot determine).

## 7. Session tokens (DB delta)

- Capture the token **end snapshot** (`IN1` / `OUT1`) using the query in
  `references/session-tokens.md`.
- This run's tokens are the delta:
  - `SESSION_INPUT_TOKENS  = IN1 - IN0`
  - `SESSION_OUTPUT_TOKENS = OUT1 - OUT0`
- Graceful degradation → `N/A` for both if: `sqlite3` is missing, the DB is
  absent/unreadable, the session id was not resolved, or the delta is negative.

## 8. Compute cost

- Read `references/model-pricing.json`; match `MODEL` case-insensitively with
  substring matching in either direction.
- `cost_usd = (SESSION_INPUT_TOKENS/1e6)*input_per_mtok + (SESSION_OUTPUT_TOKENS/1e6)*output_per_mtok`
  (input + output only — cache tokens are NOT priced). Round to 4 decimals.
- Unknown model OR `N/A` tokens → `cost_usd = "N/A"` + warning.

## 9. Write the report

- Resolve `REPORTS_DIR` per `references/reports-dir.md` (prefer
  `$IA_FRAMEWORK_DIR/mcp-bench-reports`; else derive
  `<skill_dir>/../../.ia-framework/mcp-bench-reports`). Ensure it exists
  (`mkdir -p "$REPORTS_DIR"`).
- Do NOT touch the benchmarked project's `.gitignore` — `REPORTS_DIR` lives under
  ia-framework's already-ignored `.ia-framework/` runtime dir.
- Model slug = slug rule applied to `MODEL`.
- Filename: `$REPORTS_DIR/<model-slug>__<PROMPT_SLUG>__baseline__<T_START_ISO with : replaced by ->.md`.
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
4. Reports are local-only under ia-framework's `.ia-framework/` (git-ignored); never stage or commit them, and never edit the benchmarked project's `.gitignore`.
5. Degrade gracefully: unknown model yields N/A, not failure.
6. Always end your response with the LLM-IDENTITY block.
7. Read the OpenCode DB with `sqlite3 -readonly` only — never write to it.
</constraints>
