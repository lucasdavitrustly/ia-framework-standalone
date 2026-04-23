# Phase 21: Dashboard Tuning Views - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 21-dashboard-tuning-views
**Areas discussed:** Prompt version attribution, Score threshold visualization, Near-miss diagnosis flow

---

## Prompt Version Attribution

| Option               | Description                                                     | Selected |
| -------------------- | --------------------------------------------------------------- | -------- |
| Timeline chart       | X-axis = date, Y-axis = MRR, points labeled with prompt version |          |
| Comparison table     | Rows = versions, columns = avg MRR/best MRR/# runs              |          |
| Both (chart + table) | Chart for trend, table below for drill-down, points clickable   | ✓        |

**User's choice:** Both (chart + table)

| Option                    | Description                                             | Selected |
| ------------------------- | ------------------------------------------------------- | -------- |
| Embed in benchmark runs   | Add promptVersion + promptContentHash to configSnapshot | ✓        |
| Separate version registry | Dedicated API for version history, joined at query time |          |

**User's choice:** Embed in benchmark runs

| Option                           | Description                                    | Selected |
| -------------------------------- | ---------------------------------------------- | -------- |
| Color-coded points on trend line | Different color/marker per version with legend | ✓        |
| Version change markers           | Vertical dashed lines at version change points |          |
| Separate lines per version       | Independent line per version                   |          |

**User's choice:** Color-coded points on trend line

| Option                  | Description                                 | Selected |
| ----------------------- | ------------------------------------------- | -------- |
| Filter table to version | Click filters table below                   |          |
| Open run detail         | Click opens detail panel with full run info | ✓        |
| Both                    | Click filters, double-click details         |          |

**User's choice:** Open run detail

---

## Score Threshold Visualization

| Option                          | Description                                              | Selected |
| ------------------------------- | -------------------------------------------------------- | -------- |
| Retrieval scores from search    | Actual retrieval scores from search results only         |          |
| Both retrieval + quality scores | Retrieval scores + chunk quality scores in separate tabs | ✓        |

**User's choice:** Both retrieval + quality scores

| Option                          | Description                                          | Selected |
| ------------------------------- | ---------------------------------------------------- | -------- |
| Static threshold line           | Read-only line at current threshold                  |          |
| Interactive draggable threshold | Drag to update returned/filtered counts in real-time | ✓        |
| Slider + line sync              | Slider control synced with threshold line            |          |

**User's choice:** Interactive draggable threshold

| Option                    | Description                                   | Selected |
| ------------------------- | --------------------------------------------- | -------- |
| Green/red color zones     | Green bars above threshold, red/orange below  | ✓        |
| Opacity-based distinction | Full opacity above, faded below               |          |
| Background shading        | Single color bars with background zone colors |          |

**User's choice:** Green/red color zones

| Option                   | Description                      | Selected |
| ------------------------ | -------------------------------- | -------- |
| Pick from search history | Dropdown listing recent searches | ✓        |
| Inline search input      | Type and run query on this page  |          |
| Both (history + inline)  | History dropdown + inline search |          |

**User's choice:** Pick from search history

---

## Near-Miss Diagnosis Flow

| Option                           | Description                                       | Selected |
| -------------------------------- | ------------------------------------------------- | -------- |
| Single list with divider         | One list, divider at threshold, near-misses below |          |
| Side-by-side columns             | Returned left, near-miss right                    | ✓        |
| Toggle-revealed filtered results | Toggle shows filtered results inline              |          |

**User's choice:** Side-by-side columns

| Option                           | Description                        | Selected |
| -------------------------------- | ---------------------------------- | -------- |
| Fixed percentage below threshold | Results within 10% below threshold | ✓        |
| Fixed count (next N results)     | Next 5-10 results below threshold  |          |
| Until score gap                  | Show until significant score drop  |          |

**User's choice:** Fixed percentage below threshold

| Option                        | Description                                          | Selected |
| ----------------------------- | ---------------------------------------------------- | -------- |
| Same as returned results      | File path, line range, score, source tag, chunk type | ✓        |
| Same + score delta annotation | Same + how far below threshold                       |          |
| Same + delta + impact hint    | Same + delta + what changes if threshold lowered     |          |

**User's choice:** Same as returned results

| Option                              | Description                                            | Selected |
| ----------------------------------- | ------------------------------------------------------ | -------- |
| Shared with score distribution view | Part of score distribution page, shared query selector | ✓        |
| Standalone page                     | Independent page with own query selection              |          |

**User's choice:** Shared with score distribution view

---

## Agent's Discretion

- Chunk inspector (DTUN-01) interaction design — user did not select for discussion

## Deferred Ideas

None — discussion stayed within phase scope.
