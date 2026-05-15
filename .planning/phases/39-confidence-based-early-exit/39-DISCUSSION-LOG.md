# Phase 39: Confidence-Based Early Exit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 39-confidence-based-early-exit
**Areas discussed:** Confidence threshold for keyword skip, Low-confidence response signal, Threshold configurability, Early exit logging format

---

## Confidence Threshold for Keyword Skip

| Option                 | Description                                                                      | Selected |
| ---------------------- | -------------------------------------------------------------------------------- | -------- |
| High threshold (0.8)   | Only confidence >= 0.8 triggers early exit. Conservative, fewer false positives. | ✓        |
| Medium threshold (0.6) | All keyword classifications skip vector search. More aggressive.                 |          |
| No threshold           | Any keyword classification skips. Maximum speed, riskiest.                       |          |

**User's choice:** High threshold (0.8)

### Fallback Behavior

| Option          | Description                                                                        | Selected |
| --------------- | ---------------------------------------------------------------------------------- | -------- |
| Keep fallback   | High-confidence keyword queries that return 0 results still fall back to semantic. | ✓        |
| Remove fallback | Return empty with 'no relevant context' if keyword finds nothing.                  |          |

**User's choice:** Keep fallback

---

## Low-Confidence Response Signal

| Option                  | Description                                               | Selected |
| ----------------------- | --------------------------------------------------------- | -------- |
| Reuse existing message  | Reuse anti-hallucination message already in codebase.     | ✓        |
| Text + structured field | Add confidence field to structuredContent alongside text. |          |
| Silent empty response   | Return empty result set with no message.                  |          |

**User's choice:** Reuse existing message

### Trigger Mechanism

| Option                          | Description                                             | Selected |
| ------------------------------- | ------------------------------------------------------- | -------- |
| Existing threshold              | Use Phase 32 score_threshold (default 0.5) as the gate. | ✓        |
| New retrieval confidence metric | Compute separate confidence from top-k scores.          |          |

**User's choice:** Existing threshold

---

## Threshold Configurability

| Option                    | Description                                               | Selected |
| ------------------------- | --------------------------------------------------------- | -------- |
| Single threshold          | One value: `retrieval.earlyExitConfidence` (default 0.8). | ✓        |
| Per query type            | Separate for keyword and semantic.                        |          |
| Per classification reason | Separate for quoted, symbol, verb, identifier.            |          |

**User's choice:** Single threshold

---

## Early Exit Logging Format

| Option                | Description                                                        | Selected |
| --------------------- | ------------------------------------------------------------------ | -------- |
| Extend existing event | Add `earlyExit` and `earlyExitReason` to query_classification log. | ✓        |
| Separate event        | New `early_exit_decision` log event.                               |          |

**User's choice:** Extend existing event
