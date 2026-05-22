# Phase 43: Per-Repo Indexing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-22
**Phase:** 43-per-repo-indexing
**Areas discussed:** Selective re-indexing behavior, Repo identity in payload, CLI --repo flag UX, Backward compat for existing indexes

---

## Selective re-indexing behavior

| Option               | Description                                                     | Selected |
| -------------------- | --------------------------------------------------------------- | -------- |
| Delete-then-reindex  | Delete all chunks with matching repoId, then index from scratch |          |
| Upsert + stale purge | Upsert new/changed chunks, purge stale                          |          |
| You decide           | Agent picks approach                                            |          |

**User's choice:** Initially selected "Delete-then-reindex" but then asked about distinction between --force and --repo.

**Clarification:** --repo scopes which repo; --force changes strategy (wipe vs incremental). Combined: --repo + --force = wipe that repo's chunks then full re-index.

| Option                                        | Description                                  | Selected |
| --------------------------------------------- | -------------------------------------------- | -------- |
| --repo is incremental, --force adds full wipe | Normal incremental by default, --force wipes | ✓        |
| --repo always does full wipe                  | Simpler but slower                           |          |

**User's choice:** --repo is incremental, --force adds full wipe

---

## Repo identity in payload

| Option           | Description                                 | Selected |
| ---------------- | ------------------------------------------- | -------- |
| Repo name string | Kebab-case name, human-readable, filterable | ✓        |
| UUID             | Decouples from display name                 |          |

**User's choice:** Repo name string

---

## CLI --repo flag UX

| Option                   | Description                    | Selected |
| ------------------------ | ------------------------------ | -------- |
| Error + list valid names | Fail fast with helpful message | ✓        |
| Fuzzy suggest + confirm  | Suggest closest name           |          |

**User's choice:** Error + list valid names

| Option                | Description                                       | Selected |
| --------------------- | ------------------------------------------------- | -------- |
| All repos, sequential | Index all repos one by one with progress per repo | ✓        |
| Interactive picker    | Prompt user to select repos                       |          |

**User's choice:** All repos, sequential

---

## Backward compat for existing indexes

| Option                                          | Description                      | Selected |
| ----------------------------------------------- | -------------------------------- | -------- |
| Null repoId = 'default', backfill on next index | Gradual migration                |          |
| Force full re-index on upgrade                  | Clean slate required             | ✓        |
| Coexist without migration                       | Old and new chunks live together |          |

**User's choice:** Force full re-index on upgrade

| Option                  | Description                        | Selected |
| ----------------------- | ---------------------------------- | -------- |
| Warn + suggest re-index | Non-blocking warning during search | ✓        |
| Block until re-indexed  | Strict enforcement                 |          |
| Silent fallback         | No warning                         |          |

**User's choice:** Warn + suggest re-index

---

## Agent's Discretion

- Warning message wording
- Upgrade detection mechanism
- Per-repo progress formatting
- Whether to add `reindex` alias

## Deferred Ideas

None — discussion stayed within phase scope.
