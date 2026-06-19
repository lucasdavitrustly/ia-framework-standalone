---
name: mcp-bench-judge
description: >
  Blind-judge all mcp-bench reports for a prompt slug. Scores each response on a
  fixed quality rubric with model identity hidden, reveals the models, ranks
  best→worst, computes the MCP-vs-baseline quality delta, and writes a markdown
  and a human-readable HTML report focused on what was good and what was not.
argument-hint: '[prompt-slug]'
tools:
  read: true
  glob: true
  write: true
  question: true
---

<objective>
Compare the captured mcp-bench runs for one prompt and decide which response was
best and worst — blind — then reveal the models and quantify whether the
ia-framework MCP improved quality, and at what cost.
</objective>

<process>

## 1. Resolve the prompt slug

- Resolve `REPORTS_DIR` per `references/reports-dir.md` (prefer
  `$IA_FRAMEWORK_DIR/mcp-bench-reports`; else derive
  `<skill_dir>/../../.ia-framework/mcp-bench-reports`).
- If `$ARGUMENTS` provides a slug, use it.
- Otherwise glob `"$REPORTS_DIR"/*.md` (EXCLUDING `_judgment__*`), parse the
  `prompt_slug` front-matter from each, and present the distinct slugs (with
  per-side counts) via the `question` tool for the user to pick.
- If `$REPORTS_DIR` is empty or missing, tell the user to capture runs
  first and stop.

## 2. Glob reports for the slug (LIVE — no cached state)

- Glob `"$REPORTS_DIR"/<slug>__*.md`.
- **EXCLUDE any file matching `_judgment__*`** — those are prior outputs, not inputs.
- Parse each report's YAML front-matter: `prompt`, `model`, `provider`,
  `mcp_enabled`, `timestamp`, `latency_ms_total`, `mcp.*`, `tokens.*`, `cost_usd`.
- Extract each report's Response section (the model's answer text).

## 3. Enforce the MCP / baseline pairing

- Partition reports: `MCP_RUNS` (mcp_enabled true) and `BASELINE_RUNS` (false).
- If EITHER partition is empty, HALT with clear guidance, e.g.:
  - 0 baseline: "'<slug>' has N MCP run(s) but 0 baseline run(s). Run
    `/mcp-bench-baseline \"<the prompt>\"` first."
  - 0 MCP: symmetric message for `/mcp-bench-run`.
- Re-evaluate this live every invocation (so deleting the last baseline is caught).

## 4. Score BLIND

- Assign opaque labels A, B, C, … to every report in a shuffled order.
- For scoring, expose ONLY the response text — hide model, provider, and the
  mcp_enabled flag.
- Apply `references/rubric.md`: score Correctness, Grounding/Citations,
  Completeness, Relevance (1–10 each + one-sentence justification), then the
  weighted aggregate:
  `0.35*correctness + 0.30*grounding + 0.20*completeness + 0.15*relevance`.
- For each run distill the justifications into a short **what-was-good** list and
  a short **what-was-not-good** list.

## 5. Reveal and rank

- Map each label back to its model + mcp_enabled + timestamp + metrics.
- Rank all runs by aggregate quality, descending (best → worst).
- Identify winner (highest quality) and loser (lowest).

## 6. Synthesize MCP vs baseline

- `AVG_MCP_QUALITY` = mean aggregate quality across MCP_RUNS.
- `AVG_BASELINE_QUALITY` = mean across BASELINE_RUNS.
- `QUALITY_DELTA = AVG_MCP_QUALITY - AVG_BASELINE_QUALITY` (one decimal; sign matters).
- Identify cheapest run (min numeric cost_usd; ignore N/A) and fastest run
  (min latency_ms_total).
- Write a short verdict narrative: did the MCP improve quality? Was it worth the
  extra latency/tokens/cost? Be specific and balanced.

## 7. Write the markdown judgment

- Render `references/judge-template.md`, substituting every placeholder, including
  the ranking rows and one blind-score block per run.
- Output path:
  `$REPORTS_DIR/_judgment__<slug>__<UTC-ISO with : replaced by ->.md`.

## 8. Write the HTML report

- Render `references/judge-report-template.html`:
  - Fill header, the four summary cards (winner, MCP-vs-baseline delta, cheapest,
    fastest).
  - Repeat the `<!-- REPEAT:rankrow -->` block once per ranked run.
  - Repeat the `<!-- REPEAT:run -->` block once per run, in ranked order, filling
    the ✅ good / ⚠️ not-good lists as `<li>` items and setting
    `MCP_BADGE_CLASS` to `mcp` or `baseline` (and `RUN_CARD_CLASS` to
    `is-baseline` for baseline runs).
  - `TOTAL_TOKENS` per run = session_input + session_output when numeric, else
    fall back to mcp input+output, else `N/A`.
- Output path:
  `$REPORTS_DIR/_judgment__<slug>__<UTC-ISO with : replaced by ->.html`
  (same timestamp as the markdown).

## 9. Summary line

Print:
`✓ judged <slug> · <N> reports (<M> MCP / <B> baseline) · winner=<model>(<mode>) · MCP delta=<QUALITY_DELTA> · html=<path>`

</process>

<constraints>
1. Always derive state from a LIVE glob — never a manifest or cached count.
2. ALWAYS exclude `_judgment__*` from the input glob.
3. Score blind: identity and mcp_enabled hidden during scoring.
4. Require ≥1 MCP run AND ≥1 baseline run, or halt with guidance.
5. Quality is judge-assessed (rubric), not ground-truth — state this in output.
6. Score every globbed report; average each side for the MCP-vs-baseline delta.
7. Outputs are local-only; never stage or commit them.
</constraints>
