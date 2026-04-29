---
phase: 26-hallucination-penalty-calibration
plan: '01'
subsystem: benchmark
tags: [benchmark, judge, hallucination, rubric, agent-prompts]
dependency_graph:
  requires: []
  provides: [benchmark-judge-v2, verified-entities-injection]
  affects: [benchmark-executor, rag-benchmark-skill]
tech_stack:
  added: []
  patterns: [agent-prompt-rubric, entity-verification, hallucination-penalty]
key_files:
  created: []
  modified:
    - .opencode/agents/benchmark-judge.md
    - .opencode/agents/benchmark-executor.md
    - .opencode/skills/rag-benchmark/SKILL.md
key_decisions:
  - 'Hallucination Check scored 0 or 5 (binary) — not 1-5 — to enforce hard penalty'
  - 'Double penalty for hallucination: both Hallucination Check = 0 AND Factual Precision = 0'
  - 'Legacy mode: /25 scoring preserved when Verified Entities section absent'
  - 'Rubric v2 label in judge output header for run distinguishability'
metrics:
  duration: ~8 minutes
  completed_date: '2026-04-29'
  tasks_completed: 2
  files_modified: 3
---

# Phase 26 Plan 01: Hallucination Penalty Calibration Summary

**One-liner:** Added Hallucination Check as 6th scoring dimension (0/5 binary) to benchmark judge with entity verification, raising total from /25 to /30 and fixing the anomaly where fabricated responses outscored correct ones.

## What Was Built

- **`benchmark-judge.md`** updated to Rubric v2 with 6 scoring dimensions:
  - Dimensions 1-5 remain 1-5 scale (Factual Precision, Technical Depth, Code References, Completeness, Actionability)
  - Dimension 6 is binary: Hallucination Check (0 if hallucinated entities detected, 5 if clean)
  - Total denominator updated from /25 to /30
  - Double penalty rule: hallucination sets both Hallucination Check = 0 AND Factual Precision = 0
  - "Rubric v2 (30 pts)" label added after `## Scores` heading
  - `## Hallucination Flags (if any)` section added to output format
  - Actionability row 4 updated to explicitly credit correct negative identification + nearby entity pointers
  - Legacy mode fallback: when `## Verified Entities` absent, score /25 as before

- **`benchmark-executor.md`** updated with `## Verified Entities Injection` section:
  - Describes how to extract entity names from corpus entry `expectedFiles` and `description`
  - Format for positive queries: `- EntityName — exists in this codebase`
  - Format for negative queries: `- EntityName — does NOT exist in this codebase`
  - Inject at END of judge prompt, after Response A/B content

- **`SKILL.md`** updated:
  - References 6 dimensions and /30 max total
  - New score range table reflecting /30 scale (25-30 = Excellent, etc.)
  - Qualitative metrics section updated to include `hallucination_flags`

## Problem Fixed

Before this plan: the benchmark judge scored a fully hallucinated response (fabricated `CryptoPaymentAdapter` class) at 11/25 — higher than the factually correct "class doesn't exist" answer at 7/25. The judge had no instruction to penalize fabrication.

After this plan: hallucinated response receives Hallucination Check = 0 + Factual Precision = 0 (double penalty), while correct "doesn't exist" response scores Hallucination Check = 5 + Actionability 4-5 (correct negative + nearby pointers). The correct response now clearly outscores the hallucinated one.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all rubric logic is fully specified in the agent prompt.

## Self-Check: PASSED

- `.opencode/agents/benchmark-judge.md` — exists, contains "Hallucination Check" (6 times), "XX/30", "Rubric v2", "hallucination_flags", "Verified Entities"
- `.opencode/agents/benchmark-executor.md` — exists, contains "Verified Entities Injection", "does NOT exist"
- `.opencode/skills/rag-benchmark/SKILL.md` — exists, contains "6 dimensions", "/30 total", updated score ranges
- Commits: 9c18aa0 (judge), 3a313f0 (executor + skill)
