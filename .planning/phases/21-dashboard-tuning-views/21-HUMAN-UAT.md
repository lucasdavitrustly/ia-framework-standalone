---
status: partial
phase: 21-dashboard-tuning-views
source: [21-VERIFICATION.md]
started: 2026-04-23T11:20:00Z
updated: 2026-04-23T11:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Draggable Threshold Interaction

expected: Open Score Distribution tab with a search history entry selected; drag the threshold line (or use slider) left and right — histogram bar colors update in real-time (green ↔ red), summary counts (Returned/Filtered/Near-miss) update live, NearMissPanel re-filters
result: [pending]

### 2. Prompt Version Color Assignment

expected: Run ≥2 benchmarks with different prompt versions, open Tuning → Prompt Versions tab — chart dots display distinct colors per prompt version; legend shows version-to-color mapping; comparison table shows per-version average MRR
result: [pending]

### 3. BenchmarkDetailPanel Click-Through

expected: Click a dot on the PromptVersionChart — BenchmarkDetailPanel slides open showing run label, timestamp, config snapshot, and per-query results table with hit/miss, rank, latency
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
