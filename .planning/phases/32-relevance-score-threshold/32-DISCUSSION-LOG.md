# Phase 32: Relevance Score Threshold - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 32-relevance-score-threshold
**Areas discussed:** Default threshold value & behavior, No-results response design, Override & escape hatches

---

## Default threshold value & behavior

### Q1: Default score threshold value

| Option         | Description                                                                                  | Selected |
| -------------- | -------------------------------------------------------------------------------------------- | -------- |
| 0.3 (low bar)  | Conservative — only blocks very irrelevant results. Less aggressive but safer.               |          |
| 0.5 (balanced) | Moderate — filters most irrelevant queries while keeping tangentially related results.       | ✓        |
| 0.7 (strict)   | Aggressive — only returns highly relevant results. Risk of filtering useful partial matches. |          |

**User's choice:** 0.5 (balanced, recommended)
**Notes:** None

### Q2: Hard vs soft cutoff

| Option                        | Description                                                                         | Selected |
| ----------------------------- | ----------------------------------------------------------------------------------- | -------- |
| Hard cutoff                   | If nothing passes 0.5, return zero results. Fallback system handles the empty case. | ✓        |
| Soft cutoff (always 1 result) | Always return at least 1 result even if below threshold, like the token cap does.   |          |

**User's choice:** Hard cutoff (recommended)
**Notes:** None

### Q3: Pipeline ordering relative to token cap

| Option                          | Description                                                        | Selected |
| ------------------------------- | ------------------------------------------------------------------ | -------- |
| Threshold first, then token cap | Filter low-score results first, then apply token cap to survivors. | ✓        |
| Token cap first, then threshold | Apply token cap first, then filter survivors by score.             |          |

**User's choice:** Threshold first, then token cap (recommended)
**Notes:** None

---

## No-results response design

### Q1: Message content when no results pass threshold

| Option                | Description                                                                           | Selected |
| --------------------- | ------------------------------------------------------------------------------------- | -------- |
| Terse factual message | "No relevant code found for this query." Short, lets the LLM decide.                  |          |
| Instructional message | "No relevant code found. Do not guess or hallucinate..." Explicit anti-hallucination. | ✓        |
| Fallback with caveat  | Return existing fallback (related concepts) but prefix with threshold note.           |          |

**User's choice:** Instructional message (recommended)
**Notes:** None

### Q2: Interaction with phase-23 fallback system

| Option                                    | Description                                                                                  | Selected |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| Threshold → fallback → instructional      | If empty after threshold, still try fallback. If fallback also empty, instructional message. | ✓        |
| Threshold → instructional (skip fallback) | Skip fallback entirely, go straight to instructional message.                                |          |

**User's choice:** Threshold → fallback → instructional (recommended)
**Notes:** None

---

## Override & escape hatches

### Q1: Per-query override

| Option                       | Description                                                       | Selected |
| ---------------------------- | ----------------------------------------------------------------- | -------- |
| Yes, keep existing parameter | LLM can pass score_threshold=0.3 or 0 to override. Already wired. | ✓        |
| No per-query override        | Lock to configured default, don't let LLM override per-call.      |          |

**User's choice:** Yes, keep existing parameter (recommended)
**Notes:** None

### Q2: Project-level configuration

| Option                     | Description                                                 | Selected |
| -------------------------- | ----------------------------------------------------------- | -------- |
| Yes, project-level config  | Add retrieval.scoreThreshold to .ia-framework/project.json. | ✓        |
| No, hardcoded default only | Just hardcode 0.5, tune later if needed.                    |          |

**User's choice:** Yes, project-level config (recommended)
**Notes:** None

### Q3: Disabling threshold filtering

| Option                        | Description                                                             | Selected |
| ----------------------------- | ----------------------------------------------------------------------- | -------- |
| score_threshold=0 disables it | Setting 0 in config or per-query effectively disables (all scores > 0). | ✓        |
| Separate enable/disable flag  | Add boolean retrieval.scoreFilterEnabled.                               |          |

**User's choice:** score_threshold=0 disables it (recommended)
**Notes:** None

---

## Agent's Discretion

- Exact wording of the instructional message
- Whether to log threshold filtering events in observability
- Test fixture design

## Deferred Ideas

None — discussion stayed within phase scope.
