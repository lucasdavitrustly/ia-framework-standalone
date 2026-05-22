# Phase 45: Cross-Repo Dependency Graph - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-22
**Phase:** 45-cross-repo-dependency-graph
**Areas discussed:** Import resolution strategy, Expansion boundary rules, Graph storage for cross-repo edges, Attribution in expanded results

---

## Import Resolution Strategy

| Option                      | Description                                                  | Selected |
| --------------------------- | ------------------------------------------------------------ | -------- |
| Prefix matching on provides | Match import specifier prefix against repo `provides` values | ✓        |
| Prefix + tsconfig paths     | Also support path-mapped imports from tsconfig.json          |          |
| Exact repo name match only  | Only resolve when import literally matches repo name         |          |

**User's choice:** Prefix matching on provides
**Notes:** Simple, covers most monorepo setups

| Option                             | Description                                          | Selected |
| ---------------------------------- | ---------------------------------------------------- | -------- |
| Symbol-based lookup in target repo | Find chunk where exports include the imported symbol | ✓        |
| Package exports field resolution   | Use target repo's package.json exports/main field    |          |
| Entry point only                   | Just include target repo's index.ts/main             |          |

**User's choice:** Symbol-based lookup in target repo

| Option               | Description                       | Selected |
| -------------------- | --------------------------------- | -------- |
| At index time        | Pre-compute edges during indexing | ✓        |
| At query time (lazy) | Resolve live during expansion     |          |
| Hybrid               | Index-time + query-time fallback  |          |

**User's choice:** At index time

| Option         | Description                                            | Selected |
| -------------- | ------------------------------------------------------ | -------- |
| Skip silently  | Only resolve imports matching configured repo provides | ✓        |
| Log unresolved | Log for debugging, no user-facing warning              |          |

**User's choice:** Skip silently

---

## Expansion Boundary Rules

| Option                 | Description                           | Selected |
| ---------------------- | ------------------------------------- | -------- |
| Cross-repo costs 1 hop | Crossing repo boundary consumes 1 hop | ✓        |
| Cross-repo is free     | Doesn't consume a hop                 |          |
| Max 1 cross-repo hop   | Hard cap regardless of expand_hops    |          |

**User's choice:** Cross-repo costs 1 hop

| Option                          | Description                                         | Selected |
| ------------------------------- | --------------------------------------------------- | -------- |
| All expansion types cross repos | Hierarchy, call chain, multi-hop, imports all cross | ✓        |
| Only import-based crosses       | Hierarchy and call-chain stay within repo           |          |
| Configurable per type           | User controls which types traverse boundaries       |          |

**User's choice:** All expansion types cross repos

| Option                | Description                      | Selected |
| --------------------- | -------------------------------- | -------- |
| No special repo limit | Only expand_hops=2 cap applies   | ✓        |
| Max 2 repos per chain | Prevents A→B→C→D sprawl          |          |
| Max 1 foreign repo    | Can only cross into 1 other repo |          |

**User's choice:** No special repo limit

| Option                     | Description                                     | Selected |
| -------------------------- | ----------------------------------------------- | -------- |
| Yes, with repo attribution | Show cross-repo imports with [repo-name] prefix | ✓        |
| No, search expansion only  | get_dependencies stays single-repo              |          |

**User's choice:** Yes, with repo attribution

---

## Graph Storage for Cross-Repo Edges

| Option                          | Description                        | Selected |
| ------------------------------- | ---------------------------------- | -------- |
| SQLite with repo columns        | Extend existing SQLite graph table | ✓        |
| Qdrant payload on source chunks | Store edges as payload metadata    |          |
| Dual storage                    | SQLite + Qdrant payload            |          |

**User's choice:** SQLite with repo columns

| Option                              | Description                  | Selected |
| ----------------------------------- | ---------------------------- | -------- |
| Second pass after all repos indexed | Ensures target symbols exist | ✓        |
| Inline during indexing              | May create dangling edges    |          |
| Separate edge-building command      | Manual trigger               |          |

**User's choice:** Second pass after all repos indexed

| Option                         | Description                  | Selected |
| ------------------------------ | ---------------------------- | -------- |
| Full rebuild of affected edges | Drop and rebuild on re-index | ✓        |
| Incremental diff-based update  | Only update changed edges    |          |

**User's choice:** Full rebuild of affected edges

---

## Attribution in Expanded Results

| Option                         | Description                         | Selected |
| ------------------------------ | ----------------------------------- | -------- |
| expansionRepo field on results | Add field for cross-repo provenance | ✓        |
| Infer from existing repo field | Rely on repo field difference       |          |
| Boolean flag only              | crossRepoExpansion: true            |          |

**User's choice:** expansionRepo field on results

| Option                              | Description                         | Selected |
| ----------------------------------- | ----------------------------------- | -------- |
| Yes, annotate cross-repo expansions | Show [via repo-name] in text output | ✓        |
| No extra annotation                 | Standard repo prefix only           |          |

**User's choice:** Yes, annotate cross-repo expansions

---

## Agent's Discretion

- Exact SQLite schema column types and index strategy
- Format of the `[via repo-name]` annotation
- Batching strategy for symbol lookups during edge building
- Error handling for repos with missing/stale `provides` field

## Deferred Ideas

None — discussion stayed within phase scope.
