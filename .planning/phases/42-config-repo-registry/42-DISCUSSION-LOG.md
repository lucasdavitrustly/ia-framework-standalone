# Phase 42: Config & Repo Registry - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 42-config-repo-registry
**Areas discussed:** Repo entry shape, Migration strategy, Detection behavior, Naming & identity

---

## Repo entry shape

| Option                      | Description                                                                                             | Selected |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| Minimal                     | path, name (optional), provides (auto-detected), profile (auto-detected). Indexing config stays global. | ✓        |
| Per-repo indexing overrides | path, name, provides, profile, plus per-repo includePatterns/excludePatterns/embeddingConcurrency       |          |
| Fully independent configs   | Each repo entry is almost a full ProjectConfig with its own embedding/retrieval settings                |          |

**User's choice:** Minimal
**Notes:** None

| Option           | Description                                       | Selected |
| ---------------- | ------------------------------------------------- | -------- |
| Array of strings | repos[].provides is always string[] for monorepos | ✓        |
| Single string    | One repo provides one thing                       |          |

**User's choice:** Array of strings

| Option                 | Description                            | Selected |
| ---------------------- | -------------------------------------- | -------- |
| Optional, auto-derived | Defaults to directory basename         | ✓        |
| Required name          | User must give each repo a unique name |          |

**User's choice:** Optional, auto-derived

| Option                   | Description             | Selected |
| ------------------------ | ----------------------- | -------- |
| Relative to config file  | Portable, team-friendly | ✓        |
| Absolute only            | Simple, unambiguous     |          |
| Both, normalized at load | Support both            |          |

**User's choice:** Relative to config file

---

## Migration strategy

| Option                  | Description                                                            | Selected |
| ----------------------- | ---------------------------------------------------------------------- | -------- |
| Read-time normalization | loadConfig() detects old format, normalizes in memory. File untouched. | ✓        |
| Explicit file migration | CLI command rewrites project.json                                      |          |
| Dual-mode schema        | Both formats valid forever via Zod union                               |          |

**User's choice:** Read-time normalization

| Option             | Description                                              | Selected |
| ------------------ | -------------------------------------------------------- | -------- |
| Keep in schema     | targetProjectPath remains valid, accepted but normalized | ✓        |
| Remove from schema | Breaking change, only repos[] accepted                   |          |

**User's choice:** Keep in schema

| Option                | Description                           | Selected |
| --------------------- | ------------------------------------- | -------- |
| Error                 | Validation fails if both present      | ✓        |
| repos[] wins silently | repos[] takes precedence with warning |          |

**User's choice:** Error

| Option                  | Description                                                                  | Selected |
| ----------------------- | ---------------------------------------------------------------------------- | -------- |
| RepoRegistry class      | Resolves paths, deduplicates, validates, exposes repos as normalized objects | ✓        |
| Pure function           | normalizeConfig(raw) returns NormalizedConfig                                |          |
| Zod transform in schema | Normalization inside schema parsing                                          |          |

**User's choice:** RepoRegistry class
**Notes:** User also specified that new projects (first-time CLI setup) should use repos[] format by default.

---

## Detection behavior

| Option                          | Description                                                  | Selected |
| ------------------------------- | ------------------------------------------------------------ | -------- |
| First load + explicit re-detect | Detection runs once, results stored. Re-run via CLI command. | ✓        |
| Every load                      | Always re-detect, never cache                                |          |
| Lazy (detect if empty)          | Detect once, skip unless forced                              |          |

**User's choice:** First load + explicit re-detect

| Option                       | Description                                         | Selected |
| ---------------------------- | --------------------------------------------------- | -------- |
| Written back to project.json | Each repo entry gets profile and provides populated | ✓        |
| Separate cache file          | .ia-framework/repo-profiles.json                    |          |

**User's choice:** Written back to project.json

| Option              | Description                           | Selected |
| ------------------- | ------------------------------------- | -------- |
| Silent auto-detect  | Detect and store, no user prompt      | ✓        |
| Interactive confirm | Show detected profile, ask to confirm |          |

**User's choice:** Silent auto-detect

| Option        | Description                                   | Selected |
| ------------- | --------------------------------------------- | -------- |
| Warn and skip | Mark repo as undetected, continue with others | ✓        |
| Hard error    | Fail entire load if any path missing          |          |

**User's choice:** Warn and skip

---

## Naming & identity

| Option              | Description                                               | Selected |
| ------------------- | --------------------------------------------------------- | -------- |
| Error with guidance | "Duplicate repo name. Add explicit name to disambiguate." | ✓        |
| Auto-deduplicate    | core, core-2, core-3                                      |          |
| Path-based fallback | Use full path as name                                     |          |

**User's choice:** Error with guidance

| Option                | Description                            | Selected |
| --------------------- | -------------------------------------- | -------- |
| Kebab-case normalized | Lowercase, alphanumeric + hyphens only | ✓        |
| Freeform              | Whatever the directory is named        |          |

**User's choice:** Kebab-case normalized

| Option                 | Description                 | Selected |
| ---------------------- | --------------------------- | -------- |
| Immutable once indexed | Rename = re-index           | ✓        |
| Renameable via CLI     | CLI updates Qdrant payloads |          |

**User's choice:** Immutable once indexed

---

## Agent's Discretion

- RepoRegistry class API surface
- Zod schema structure details
- Detection heuristics ordering
- Warning message wording

## Deferred Ideas

None — discussion stayed within phase scope.
