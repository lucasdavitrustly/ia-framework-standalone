# Phase 19: Baseline & Score Filtering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 19-baseline-score-filtering
**Areas discussed:** Baseline reproducibility, Score threshold fix strategy, Prompt versioning scheme, Chunk validation behavior

---

## Baseline Reproducibility

| Option        | Description                                                     | Selected |
| ------------- | --------------------------------------------------------------- | -------- |
| Trust-based   | Document "don't re-index between runs". No tooling enforcement. | ✓        |
| Hash-check    | Snapshot collection fingerprint before run, warn if changed.    |          |
| Frozen export | Dump corpus to file and benchmark from that.                    |          |

**User's choice:** Trust-based
**Notes:** Simplest approach, no extra tooling needed.

| Option                    | Description                              | Selected |
| ------------------------- | ---------------------------------------- | -------- |
| 3-run average with stddev | Run 3 times, average MRR, report stddev. | ✓        |
| Adaptive                  | Run until stddev < 0.01, cap at 5 runs.  |          |

**User's choice:** 3-run average with stddev

| Option                        | Description                          | Selected |
| ----------------------------- | ------------------------------------ | -------- |
| Dedicated baseline subcommand | `ia-framework benchmark baseline`    | ✓        |
| Flag on existing run command  | `--baseline` flag on `benchmark run` |          |

**User's choice:** Dedicated baseline subcommand

| Option                                 | Description                                    | Selected |
| -------------------------------------- | ---------------------------------------------- | -------- |
| Tagged benchmark run in existing store | Reuse existing SQLite schema with baseline tag | ✓        |
| Dedicated baseline table               | Separate table with own schema                 |          |

**User's choice:** Tagged benchmark run in existing store

---

## Score Threshold Fix Strategy

| Option                    | Description                   | Selected |
| ------------------------- | ----------------------------- | -------- |
| Mode-aware defaults       | 0.3 dense, 0.0 hybrid/RRF     | ✓        |
| Remove all thresholds     | Just use limit                |          |
| Both pre-RRF and post-RRF | More control, more complexity |          |

**User's choice:** Mode-aware defaults

| Option       | Description                        | Selected |
| ------------ | ---------------------------------- | -------- |
| Engine-level | SearchEngine picks default by mode | ✓        |
| Tool-level   | MCP tools set per-mode defaults    |          |

**User's choice:** Engine-level

| Option                | Description                        | Selected |
| --------------------- | ---------------------------------- | -------- |
| Allow override        | User can still pass scoreThreshold | ✓        |
| Enforce mode defaults | No user override                   |          |

**User's choice:** Allow override
**Notes:** Confirmed three modes: dense (0.3), hybrid (0.0), multi-collection RRF (0.0).

---

## Prompt Versioning Scheme

| Option                 | Description                           | Selected |
| ---------------------- | ------------------------------------- | -------- |
| Content hash           | SHA-256 of prompt text, auto-computed |          |
| Manual semver          | Developer bumps version string        |          |
| Auto-increment counter | Integer in config, bumped via CLI     | ✓        |

**User's choice:** Auto-increment counter in config

| Option        | Description                                           | Selected |
| ------------- | ----------------------------------------------------- | -------- |
| In cache key  | sha256(content):model:promptVersion, auto-invalidates | ✓        |
| Metadata only | Manual cache clear needed                             |          |

**User's choice:** In cache key — auto-invalidates

| Option                        | Description                              | Selected |
| ----------------------------- | ---------------------------------------- | -------- |
| Collection metadata in Qdrant | Query Qdrant API to trace prompt version | ✓        |
| project.json config           | Simpler but decoupled from data          |          |

**User's choice:** Collection metadata in Qdrant

| Option             | Description                 | Selected |
| ------------------ | --------------------------- | -------- |
| CLI bump command   | `ia-framework prompt bump`  | ✓        |
| Manual config edit | Edit version in config file |          |

**User's choice:** CLI bump command

---

## Chunk Validation Behavior

| Option      | Description                   | Selected |
| ----------- | ----------------------------- | -------- |
| Report-only | Warn but don't block indexing | ✓        |
| Block       | Fail indexing on violations   |          |
| Auto-repair | Extend chunks to fill gaps    |          |

**User's choice:** Report-only

| Option                  | Description                              | Selected |
| ----------------------- | ---------------------------------------- | -------- |
| Standalone CLI command  | `ia-framework validate-chunks` on demand |          |
| Auto-run after indexing | Always validates after LLM index         | ✓        |
| Both                    | Auto-run and standalone                  |          |

**User's choice:** Auto-run after indexing

| Option           | Description                                        | Selected |
| ---------------- | -------------------------------------------------- | -------- |
| Per-file summary | X files checked, Y with gaps, list worst offenders | ✓        |
| Per-line detail  | Exact line ranges per file                         |          |

**User's choice:** Per-file summary with worst offenders

| Option                 | Description                                    | Selected |
| ---------------------- | ---------------------------------------------- | -------- |
| All four checks        | Gaps, overlaps, out-of-bounds, empty summaries | ✓        |
| Gaps and overlaps only | Core coverage checks                           |          |

**User's choice:** All four checks

---

## Agent's Discretion

- SQLite schema changes for baseline tagging
- Validation report format (console output vs file)
- Prompt version counter initialization (start at 1 or 0)

## Deferred Ideas

None — discussion stayed within phase scope.
