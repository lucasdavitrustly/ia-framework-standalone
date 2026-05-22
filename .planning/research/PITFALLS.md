# Domain Pitfalls — v1.7 Multi-Repo Indexing

**Domain:** Adding multi-repo indexing to an existing single-repo RAG system
**Researched:** 2026-05-21
**Confidence:** HIGH (based on existing system architecture analysis — 41 phases of single-repo development)

> **Context:** The system has a mature single-repo pipeline: AST+LLM chunking, hybrid BM25+dense with RRF, dependency graph expansion, Maven module graph, benchmark system, dashboard. These pitfalls cover mistakes when EXTENDING to multi-repo, not building from scratch.

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or breaking changes for existing users.

---

### Pitfall 1: Breaking the Single-Repo Config Contract

**What goes wrong:** Changing `project.json` schema from `{ projectPath: string }` to `{ projects: [...] }` breaks all existing installations. Users who upgrade find their config rejected.
**Why it happens:** Developer focuses on multi-repo design without writing a migration path for the single-repo format.
**Consequences:** Every existing user must manually update config. Automation scripts break. If the installer overwrites, existing indexing state is lost.
**Prevention:** Support BOTH formats — single string (legacy) normalized to array internally. Add a `configVersion` field. Write an auto-migration in the config loader that converts old format to new on first read without user action.
**Detection:** Unit test: load a v1.6-era `project.json` into the new config loader — it must work unchanged.

**Phase:** Must be the FIRST thing addressed before any multi-repo logic.

---

### Pitfall 2: Collection Naming / Point ID Collision

**What goes wrong:** Two repos contain files with identical relative paths (e.g., `src/index.ts`). Without repo-scoped identifiers, points overwrite each other or searches return wrong-repo results.
**Why it happens:** The existing system uses file paths as unique identifiers in Qdrant payloads. Multi-repo makes relative paths non-unique.
**Consequences:** Silent data corruption — chunks from repo A overwrite repo B's chunks. Search results attribute code to wrong repos. Dependency graph links cross repos incorrectly.
**Prevention:** Prefix all Qdrant point IDs and payload paths with a repo identifier (e.g., `repo:fi-core/src/index.ts`). Use a deterministic repo slug derived from the repo root path or a user-assigned alias. Hash function for point IDs must include repo slug.
**Detection:** Index two repos with overlapping file paths → verify both appear in search results with correct source attribution.

**Phase:** Core infrastructure — must be solved before unified indexing pipeline.

---

### Pitfall 3: Dependency Graph Merging Without Boundary Semantics

**What goes wrong:** The existing `DependencyGraph` assumes all files live in one tree. Merging graphs from multiple repos creates false edges (e.g., `import { Foo } from '../core/Foo'` resolves to wrong file in wrong repo).
**Why it happens:** Path resolution logic uses relative paths from a single root. Multi-repo has multiple roots, and cross-repo imports use package names, not relative paths.
**Consequences:** `get_module_dependencies` returns nonsense — showing "dependencies" that don't exist. Graph expansion retrieves irrelevant chunks from wrong repos. LLM gets polluted context.
**Prevention:**

1. Each repo gets its own `DependencyGraph` instance.
2. Cross-repo edges are explicit — resolved via package.json/pom.xml dependency declarations, not path heuristics.
3. A `MultiRepoDependencyGraph` wrapper merges individual graphs with explicit cross-repo edge registration.
4. The `expand_hops` parameter on MCP tools should respect repo boundaries by default, with opt-in cross-repo expansion.

**Detection:** Query dependency expansion for a class that exists in both repos — verify it doesn't conflate them.

**Phase:** After per-repo indexing works, before cross-repo search is enabled.

---

### Pitfall 4: Re-indexing All Repos on Any Change

**What goes wrong:** The indexing pipeline triggers a full re-index of ALL repos when any single file changes, because the watcher/indexer doesn't distinguish which repo changed.
**Why it happens:** Existing file watcher and indexing loop was designed for one root path. Adding more paths without scoping the change detection causes cascading re-indexes.
**Consequences:** A save in one repo triggers minutes of indexing across all repos. CPU/memory spike. Qdrant write amplification. Developer experience degrades from seconds to minutes.
**Prevention:** Per-repo indexing state: each repo tracks its own `lastIndexedAt`, file hashes, and dirty-file list independently. Watcher events are scoped to their source repo. Use separate chokidar instances per repo root.
**Detection:** Change one file in repo A → verify only repo A's chunks are updated.

**Phase:** Indexing pipeline design — address during unified indexing implementation.

---

## Moderate Pitfalls

### Pitfall 5: Ambiguous Search Results Without Source Context

**What goes wrong:** Unified search returns chunks from multiple repos but the MCP tool response doesn't clearly indicate which repo each result comes from. The LLM generates code referencing the wrong package/module.
**Prevention:** Every search result payload MUST include `repo` field. MCP tool response format must surface repo name prominently (not buried in metadata). Consider formatting as `[repo-name] path/to/file.ts` in results.

---

### Pitfall 6: Config Complexity Explosion

**What goes wrong:** Each repo might need different embedding models, chunking strategies, or ignore patterns. The config becomes a nested nightmare that's hard to validate and document.
**Prevention:** Design config as: global defaults + per-repo overrides. Most repos inherit defaults; only specify per-repo what differs. Validate with Zod discriminated unions. Keep the common case (all repos same settings) as simple as adding a path to the array.

---

### Pitfall 7: Stale Repo References

**What goes wrong:** A configured repo path no longer exists (moved, deleted, renamed). The indexer crashes or silently skips it with no user feedback.
**Prevention:** At startup, validate all configured paths exist and are git repos. Emit clear warnings for missing repos. Add `ia-framework status` showing per-repo health. Don't crash — degrade gracefully (index what's available, warn about what's missing).

---

### Pitfall 8: Cross-Repo Search Relevance Dilution

**What goes wrong:** Adding more repos increases the search corpus significantly. Queries that used to return precise results from one repo now return scattered results across repos, many irrelevant.
**Prevention:** Support repo-scoped search filters (search within specific repo OR across all). Consider a `focusRepo` parameter on MCP tools. The existing relevance threshold and token budget cap (6000 tokens, 70/30 split) may need per-repo awareness.

---

### Pitfall 9: Maven Module Graph vs Git Repo Boundary Mismatch

**What goes wrong:** The existing `get_module_dependencies` MCP tool assumes Maven modules live in a single git repo. With multi-repo, a parent POM in repo A references modules in repo B — the POM parser can't resolve cross-repo module paths.
**Prevention:** Extend Maven module resolution to accept a mapping of `artifactId → repo`. When a module isn't found in the current repo's tree, look up the artifact in other indexed repos' module registries.

---

### Pitfall 10: Existing MCP Tool Contracts Break

**What goes wrong:** Adding `repo` parameter to `search_codebase`, `get_file`, `get_dependencies` etc. changes the tool schema. OpenCode/LLM prompts that worked before now need updating. Worse: if repo param is required, all existing usage breaks.
**Prevention:** Make `repo` parameter optional on all MCP tools. When omitted: if only one repo configured, use it (backward compatible); if multiple repos, search all (sensible default). Never make it required.

---

## Minor Pitfalls

### Pitfall 11: Benchmark Corpus Assumes Single Repo

**What goes wrong:** Existing benchmark queries and expected results reference files by path without repo prefix. Multi-repo makes these ambiguous.
**Prevention:** Extend benchmark corpus format to include optional repo field in expected results. Existing single-repo benchmarks auto-infer repo from the single configured project. Don't break existing corpus files.

---

### Pitfall 12: Dashboard Doesn't Show Per-Repo Metrics

**What goes wrong:** Indexing status, token usage, and quality metrics are aggregated. Developer can't tell which repo has poor retrieval quality or is consuming most tokens.
**Prevention:** Store metrics with repo tag in SQLite. Dashboard shows aggregate + per-repo breakdown. Not MVP-blocking but important for debugging multi-repo issues.

---

### Pitfall 13: Concurrent Indexing Race Conditions

**What goes wrong:** Two repos indexing simultaneously write to shared state (SQLite metrics DB, Qdrant) and corrupt each other's progress tracking.
**Prevention:** Per-repo indexing locks. SQLite in WAL mode handles concurrent reads. Point ID generation must be collision-free (include repo slug in ID hash input).

---

## Phase-Specific Warnings

| Phase Topic                 | Likely Pitfall                                  | Mitigation                                  |
| --------------------------- | ----------------------------------------------- | ------------------------------------------- |
| Config schema change        | Breaking existing single-repo users (Pitfall 1) | Auto-migration + dual-format support        |
| Collection/payload design   | Path collision across repos (Pitfall 2)         | Repo-prefixed identifiers                   |
| Unified indexing pipeline   | Re-index cascade on any change (Pitfall 4)      | Per-repo indexing state isolation           |
| MCP tool updates            | Breaking existing tool contracts (Pitfall 10)   | Optional repo param, sensible defaults      |
| Cross-repo dependency graph | False edges from path resolution (Pitfall 3)    | Separate graphs + explicit cross-repo edges |
| Unified search              | Relevance dilution (Pitfall 8)                  | Repo-scoped filtering, focusRepo param      |
| Benchmark updates           | Corpus assumes single repo (Pitfall 11)         | Extend format with optional repo field      |
| Dashboard                   | No per-repo visibility (Pitfall 12)             | Repo-tagged metrics in SQLite               |

## Recommended Phase Order (Based on Pitfall Dependencies)

1. **Config migration** — Pitfall 1 must be solved first or everything breaks existing users
2. **Per-repo indexing with repo-tagged payloads** — Pitfalls 2, 4 (foundation for everything else)
3. **MCP tool updates with backward-compatible repo param** — Pitfall 10 (unblocks search)
4. **Unified search with source attribution** — Pitfalls 5, 8
5. **Cross-repo dependency graph** — Pitfall 3 (hardest, most likely to need a research spike)
6. **Dashboard/benchmark updates** — Pitfalls 11, 12 (polish, not blocking)

## Sources

- Existing system analysis: `.planning/PROJECT.md` (41 phases, known architecture)
- Known components at risk: DependencyGraph, Maven module graph (`get_module_dependencies`), Qdrant payload schema, MCP tool contracts, project.json config loader, benchmark corpus format, chokidar file watcher, SQLite metrics store
- Confidence: HIGH — all pitfalls derived from known system internals, not speculative
