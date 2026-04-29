# Phase 26: Hallucination Penalty Calibration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 26-hallucination-penalty-calibration
**Areas discussed:** Hallucination detection instruction, Rescore CLI scope, Honest uncertainty scoring, Score denominator migration

---

## Judge Location (Pre-discussion finding)

| Option                | Description                                                                      | Selected |
| --------------------- | -------------------------------------------------------------------------------- | -------- |
| Markdown agent prompt | Update .opencode/agents/benchmark-judge.md — that's where the rubric lives today | ✓        |
| New TypeScript module | Build judge.ts in packages/benchmark/src/ and wire into runner                   |          |
| Both                  | Update agent prompt AND add TypeScript infrastructure                            |          |

**Finding:** The existing CONTEXT.md incorrectly referenced `packages/benchmark/src/judge.ts` which does not exist. The judge is an OpenCode agent prompt in `.opencode/agents/benchmark-judge.md`. The TypeScript benchmark package handles retrieval metrics (Hit@K, MRR) only.

---

## Hallucination Detection Instruction

| Option                    | Description                                                   | Selected |
| ------------------------- | ------------------------------------------------------------- | -------- |
| Entity list from corpus   | Inject verified entity list from benchmark corpus per query   | ✓        |
| Self-contained text check | Judge flags entities it can't verify from response text alone |          |
| Confidence-gated flagging | Only flag when response asserts fabricated code blocks        |          |

**Entity list injection format:**
| Option | Description | Selected |
|--------|-------------|----------|
| Structured section in prompt | `## Verified Entities` section in judge prompt | ✓ |
| JSON object | JSON alongside the prompt | |
| Inline append | Entity list appended after query text | |

**Entity list content:**
| Option | Description | Selected |
|--------|-------------|----------|
| Class and method names only | Not file paths | ✓ |
| Class + method + file paths | Full expectedFiles context | |
| Full indexed corpus entities | All enumerable entities | |

**Negative query labeling:**
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, include non-existent label | Explicit label for queried non-existent entity | ✓ |
| No, omit unknowns | Judge infers from absence | |
| Separate non-existent section | Dedicated section for negative queries only | |

**User's choice:** Entity list via structured `## Verified Entities` section; class/method names only; negative queries explicitly label the queried entity as non-existent.

---

## Rescore CLI Scope

| Option                       | Description                                          | Selected |
| ---------------------------- | ---------------------------------------------------- | -------- |
| Out of scope for Phase 26    | Phase 26 only updates the judge prompt               | ✓        |
| In scope for Phase 26        | Add CLI command that re-runs judge on stored reports |          |
| Document manual rescore only | Add manual re-run note to guide                      |          |

**Validation approach:**
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, use existing report as test | Re-score 2026-04-24 report manually with updated judge | ✓ |
| No, fresh run only | Run fresh benchmark and compare | |
| Both | Validate against existing report AND run fresh benchmark | |

**User's choice:** Rescore CLI is deferred. Validation uses the existing 2026-04-24 report as a manual re-score test.

---

## Honest Uncertainty Scoring

| Option                      | Description                                                             | Selected |
| --------------------------- | ----------------------------------------------------------------------- | -------- |
| Explicit rubric instruction | Add instruction to Actionability dimension for correct negative answers | ✓        |
| Separate bonus dimension    | New 0 or 1 point dimension                                              |          |
| No change                   | Current rubric already handles it                                       |          |

**Threshold definition:**
| Option | Description | Selected |
|--------|-------------|----------|
| Non-existence + nearby pointers | Identifies non-existence AND names real nearby entities | ✓ |
| Non-existence identification only | Just correctly says it doesn't exist | |
| Full guidance (non-exist + pointers + reformulation) | Must also suggest correct query reformulation | |

**User's choice:** Explicit rubric instruction in Actionability; threshold is non-existence identification + at least one real nearby entity pointer.

---

## Score Denominator Migration

| Option                              | Description                                       | Selected |
| ----------------------------------- | ------------------------------------------------- | -------- |
| Update to /30, old reports stay /25 | New reports /30; incompatibility is explicit      | ✓        |
| Normalize to 0-100%                 | Normalize all scores for cross-version comparison |          |
| Keep /25, flag separately           | Hallucination Check outside score total           |          |

**Rubric version indicator:**
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add rubric version note | `Rubric v2 (30 pts)` in judge output header | ✓ |
| No, date is sufficient | Report date distinguishes versions | |
| Structured prompt_version field | Machine-readable version field | |

**User's choice:** Update to /30; add "Rubric v2 (30 pts)" note in judge output header; old reports remain at /25.

---

## Agent's Discretion

- Exact wording of Hallucination Check rubric rows
- Exact wording of entity verification rule in Rules section
- Format of `hallucination_flags` in judge output (inline list vs dedicated section)
- How benchmark executor assembles Verified Entities list from corpus entry

## Deferred Ideas

- `ia-framework benchmark rescore` CLI — follow-on phase
- `judge.ts` TypeScript module — not needed; judge is agent prompt
- Automated hallucination detection without LLM — too complex for v1.3
- Real-time hallucination flagging in MCP server — separate concern
- `hallucination_rate` metric in dashboard — depends on rescore infrastructure
