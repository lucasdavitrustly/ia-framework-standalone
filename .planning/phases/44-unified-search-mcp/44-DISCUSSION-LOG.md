# Phase 44: Unified Search & MCP - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-22
**Phase:** 44-unified-search-mcp
**Areas discussed:** Result attribution format, Cross-repo ranking, Path resolution for get_file/get_dependencies, Repo filtering in search

---

## Result Attribution Format

| Option                            | Description                                                | Selected |
| --------------------------------- | ---------------------------------------------------------- | -------- |
| Prefix in anchor                  | Results show `[repo-name] src/path/File.ts:10-20`          |          |
| Both: JSON field + display prefix | Separate `repo` field in JSON AND prefix in display string | ✓        |
| JSON field only                   | Only add `repo` field to JSON, keep display unchanged      |          |

**User's choice:** Both: JSON field + display prefix
**Notes:** Maximum clarity for both AI parsing and human reading.

| Option               | Description                                          | Selected |
| -------------------- | ---------------------------------------------------- | -------- |
| Always show          | Show prefix on every result regardless of repo count | ✓        |
| Only when multi-repo | Only show prefix when multiple repos configured      |          |

**User's choice:** Always show
**Notes:** Consistent, no ambiguity.

---

## Cross-Repo Ranking

| Option                  | Description                                                   | Selected |
| ----------------------- | ------------------------------------------------------------- | -------- |
| Pure relevance score    | Qdrant scores determine order regardless of repo              |          |
| Repo priority weighting | Configurable priority weights per repo                        |          |
| Grouped by repo         | Group results by repo, ordered within each group by relevance | ✓        |

**User's choice:** Grouped by repo

| Option                | Description                                         | Selected |
| --------------------- | --------------------------------------------------- | -------- |
| Best-match repo first | Repo with highest-scoring single result comes first | ✓        |
| Alphabetical          | Alphabetical by repo name                           |          |
| Config order          | Order by declaration order in project.json          |          |

**User's choice:** Best-match repo first

| Option               | Description                                    | Selected |
| -------------------- | ---------------------------------------------- | -------- |
| Natural distribution | Proportional representation based on hit count | ✓        |
| Min 1 per repo       | Ensure at least 1 result per repo              |          |
| Even split           | Split evenly across repos                      |          |

**User's choice:** Natural distribution

---

## Path Resolution for get_file/get_dependencies

| Option                           | Description                                               | Selected |
| -------------------------------- | --------------------------------------------------------- | -------- |
| Require repo prefix              | Accept `repo:path/to/file.ts` syntax, always require repo |          |
| Auto-resolve, return all matches | Try all repos, return all matches with attribution        | ✓        |
| Auto-resolve, error on conflict  | Try all repos, error if ambiguous                         |          |

**User's choice:** Auto-resolve, return all matches

| Option                  | Description                                       | Selected |
| ----------------------- | ------------------------------------------------- | -------- |
| Support optional prefix | Accept optional `repo:` prefix for disambiguation | ✓        |
| Plain path only         | Keep parameter as plain path only                 |          |

**User's choice:** Support optional prefix

---

## Repo Filtering in Search

| Option                  | Description                                            | Selected |
| ----------------------- | ------------------------------------------------------ | -------- |
| Optional repo filter    | Add optional `repo` param, filters by repoId in Qdrant | ✓        |
| Always all repos        | No filtering param, always search all                  |          |
| Multi-repo filter array | `repos` array param for multi-repo filtering           |          |

**User's choice:** Optional repo filter

| Option            | Description                      | Selected |
| ----------------- | -------------------------------- | -------- |
| Single string     | Accept a single repo name string | ✓        |
| Array/multi-value | Accept comma-separated or array  |          |

**User's choice:** Single string

---

## Agent's Discretion

- Exact grouping separator format in text output
- Whether `get_module_dependencies` gets repo awareness in this phase
- Error message wording for invalid repo filter values
- Whether to surface repo count/names in search result summary header

## Deferred Ideas

None — discussion stayed within phase scope.
