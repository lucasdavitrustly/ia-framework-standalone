# Project Research Summary

**Project:** ia-framework v1.7 — Multi-Repo Indexing
**Domain:** Cross-repository RAG indexing extension
**Researched:** 2026-05-21
**Confidence:** HIGH

## Executive Summary

Multi-repo indexing is an **extension** of a mature single-repo RAG system (41 phases of prior development), not a greenfield build. The research unanimously concludes that **no new runtime dependencies are needed** — the existing stack (Qdrant payloads, better-sqlite3 dependency graph, Zod config, tree-sitter, chokidar) already supports multi-repo when parameterized by a `repoId` field. The recommended approach is payload-based multi-tenancy in shared Qdrant collections with a new `RepoRegistry` normalization layer.

The critical path is: Config schema migration → Repo-tagged payloads → Unified search → Cross-repo dependency graph. The architecture is deliberately additive — all changes maintain backward compatibility with existing single-repo installations. Cross-repo dependency resolution (following imports across repo boundaries) is the hardest problem and the only area requiring a potential research spike during implementation.

The top risk is **breaking existing users** by changing the config contract. This is mitigated by supporting both `targetProjectPath` (legacy single string) and `repos[]` (new array) formats simultaneously, with auto-normalization internally. Secondary risks include point ID collisions across repos with identical file paths and relevance dilution when searching across many repos.

## Key Findings

### Recommended Stack

No new libraries. All multi-repo capability comes from schema extensions and logic changes to existing code. See [STACK.md](./STACK.md) for full analysis.

**Key decisions:**

- **Single Qdrant collection + `repoId` payload field** — not separate collections per repo (avoids N² search paths)
- **SQLite graph extension** — add `source_repo`/`target_repo` columns, keep single DB for cross-repo edge queries
- **Explicit `provides` config** — user declares what each repo exports (package names), no magical auto-detection

### Expected Features

See [FEATURES.md](./FEATURES.md) for full dependency graph and complexity assessment.

**Must have (table stakes):**

- Multi-path config in project.json (declare repos to index)
- Per-repo auto-detection (each repo may be different stack)
- Unified search across all repos with source attribution
- Independent re-indexing per repo
- MCP tools return repo origin

**Should have (differentiators):**

- Cross-repo dependency graph (follow imports across boundaries)
- Repo-scoped search filter
- Unified dependency expansion across repos

**Defer (v2+):**

- Cross-repo module graph (Maven multi-module across repos — niche)
- Repo priority/weighting (no schema impact, easy to add later)

### Architecture Approach

Payload-based multi-tenancy with a RepoRegistry normalization layer. Every component is MODIFIED, not replaced. One new class (`RepoRegistry`) normalizes single/multi-repo configs. See [ARCHITECTURE.md](./ARCHITECTURE.md) for full component boundaries, data flows, and build order.

**Major components (modified):**

1. **Config Schema + RepoRegistry** — normalize both config formats, manage repo definitions
2. **Indexing Pipeline** — iterate repos, tag chunks with repoId, per-repo state isolation
3. **SearchEngine** — optional repo filter, result attribution
4. **DependencyGraph** — cross-repo expansion via explicit edges
5. **MCP Server** — optional `repo` param on tools, formatted output with repo prefix

### Critical Pitfalls

See [PITFALLS.md](./PITFALLS.md) for all 13 pitfalls with prevention strategies.

1. **Breaking single-repo config** — Support both formats; auto-normalize legacy `targetProjectPath` to `repos[0]`
2. **Point ID collision** — Include repoId in hash input for Qdrant point IDs
3. **False dependency edges** — Separate per-repo graphs + explicit cross-repo edge registration
4. **Re-index cascade** — Per-repo indexing state, separate chokidar instances
5. **MCP tool contract breakage** — All `repo` params optional; omitted = search all repos

## Implications for Roadmap

### Phase 1: Config & Types Foundation

**Rationale:** Everything depends on the config schema. Must solve backward compatibility first.
**Delivers:** `RepoConfigSchema`, `repoId` in types, `RepoRegistry` class, config auto-migration
**Addresses:** Multi-path config, backward compat
**Avoids:** Pitfall 1 (breaking existing users), Pitfall 2 (ID collisions — design IDs here)

### Phase 2: Per-Repo Indexing Pipeline

**Rationale:** Data must exist before search can work. Indexing pipeline needs to iterate repos and tag chunks.
**Delivers:** Repo-tagged Qdrant payloads, per-repo indexing state, payload index on `repoId`
**Addresses:** Independent re-indexing, per-repo detection
**Avoids:** Pitfall 4 (re-index cascade), Pitfall 13 (concurrent race conditions)

### Phase 3: Search & MCP Tool Updates

**Rationale:** With indexed multi-repo data, enable querying. MCP tools are the user-facing surface.
**Delivers:** Unified search with repo filter, repo attribution in results, updated MCP tool schemas
**Addresses:** Unified search, repo-scoped filter, MCP repo origin
**Avoids:** Pitfall 5 (ambiguous results), Pitfall 8 (relevance dilution), Pitfall 10 (contract breakage)

### Phase 4: Cross-Repo Dependency Graph

**Rationale:** Hardest problem, depends on multi-repo data existing. Import resolution across boundaries is language-specific.
**Delivers:** Cross-repo edge resolution, `getNeighborFilesAcrossRepos`, package-to-repo mapping
**Addresses:** Cross-repo dependency graph, unified expansion
**Avoids:** Pitfall 3 (false edges from path resolution)

### Phase 5: Dashboard & Benchmark Updates

**Rationale:** Polish and observability. Not blocking core functionality.
**Delivers:** Per-repo metrics in dashboard, benchmark corpus format extension
**Addresses:** Per-repo visibility, benchmark accuracy
**Avoids:** Pitfall 11 (corpus assumes single repo), Pitfall 12 (no per-repo metrics)

### Phase Ordering Rationale

- Config → Indexing → Search → Graph follows strict data dependency
- All 4 research files independently agree on this ordering
- Cross-repo graph isolated to Phase 4 (highest risk, only needed for differentiators)
- Dashboard/benchmarks last (display-only, no downstream dependents)

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 4 (Cross-Repo Graph):** Language-specific import resolution across repos has edge cases (Maven groupId mapping, TypeScript package.json exports, Python module paths)

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Config):** Pure Zod schema work, well-understood
- **Phase 2 (Indexing):** Existing pipeline + loop; additive
- **Phase 3 (Search/MCP):** Qdrant payload filtering is documented and validated
- **Phase 5 (Dashboard):** Display-only changes

## Confidence Assessment

| Area         | Confidence | Notes                                                         |
| ------------ | ---------- | ------------------------------------------------------------- |
| Stack        | **HIGH**   | No new deps — all capabilities verified in existing codebase  |
| Features     | **HIGH**   | Based on existing architecture + Sourcegraph patterns         |
| Architecture | **HIGH**   | Derived from actual codebase analysis (code paths identified) |
| Pitfalls     | **HIGH**   | All derived from known system internals, not speculative      |

**Overall confidence:** **HIGH**

### Gaps to Address

- **Python cross-repo import resolution:** No standard package.json equivalent; needs explicit mapping config. Address during Phase 4 planning.
- **Scale at 10+ repos:** Qdrant collection size and SQLite graph performance untested. Monitor during Phase 2.
- **Config migration testing:** Need integration test with real v1.6 config files to validate auto-migration.

## Sources

### Primary (HIGH confidence)

- Existing ia-framework codebase (41 phases of validated architecture)
- Qdrant payload filtering documentation (indexed fields, efficient string match)
- `.planning/PROJECT.md` v1.7 milestone definition

### Secondary (MEDIUM confidence)

- Sourcegraph cross-repository code intelligence model (design inspiration)

---

_Research completed: 2026-05-21_
_Ready for roadmap: yes_
