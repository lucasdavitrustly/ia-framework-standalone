# Feature Landscape: Multi-Repo Indexing

**Domain:** Cross-repository code search and context retrieval for RAG
**Researched:** 2026-05-21
**Overall confidence:** HIGH (based on established patterns from Sourcegraph, GitHub Code Search, and existing ia-framework architecture)

## Table Stakes

Features developers expect when multi-repo is advertised. Missing = broken experience.

| Feature                           | Why Expected                                  | Complexity | Depends On                  |
| --------------------------------- | --------------------------------------------- | ---------- | --------------------------- |
| Multi-path config in project.json | Users need to declare which repos to index    | Low        | Existing config system      |
| Per-repo auto-detection           | Each repo may be different stack (Java + TS)  | Low        | Existing profile detection  |
| Unified search across all repos   | Core promise — one query, all repos           | Medium     | Repo-tagged Qdrant payloads |
| Source repo in search results     | Must know WHERE a result came from            | Low        | Payload metadata            |
| Independent re-indexing per repo  | Can't re-index all repos when one changes     | Medium     | Index isolation             |
| MCP tools return repo origin      | AI needs to attribute code to correct project | Low        | Payload propagation         |
| Incremental add/remove repos      | Add a repo without re-indexing everything     | Low        | Per-repo collection/tagging |

## Differentiators

Features that make multi-repo search genuinely useful vs. just running separate indexes.

| Feature                       | Value Proposition                                                       | Complexity | Depends On                             |
| ----------------------------- | ----------------------------------------------------------------------- | ---------- | -------------------------------------- |
| Cross-repo dependency graph   | Follow imports across repo boundaries (e.g., shared library → consumer) | High       | Dependency graph + repo mapping        |
| Repo-scoped search filter     | "Search only in repo X" when you know the target                        | Low        | Filter on repo tag                     |
| Cross-repo type resolution    | Interface in `core-lib`, impl in `service-app` — expand to both         | High       | Cross-repo dep graph                   |
| Unified dependency expansion  | `get_dependencies` follows imports even when target is in another repo  | High       | Cross-repo dep graph                   |
| Repo priority/weighting       | Prefer results from "main" repo over shared libraries                   | Medium     | Search-time boost factor               |
| Repo relationship declaration | Explicit config: "repo A depends on repo B" for smarter expansion       | Low        | Config schema                          |
| Cross-repo module graph       | `get_module_dependencies` spans repos (Maven multi-module across repos) | High       | Existing module graph + repo awareness |

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature                 | Why Avoid                                                   | What to Do Instead                              |
| ---------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Git-based auto-discovery     | Scanning filesystem for repos adds magic/complexity         | Explicit config — user declares repo paths      |
| Remote repo cloning          | Fetching from GitHub/GitLab adds auth, caching, staleness   | Local paths only — repos must be cloned locally |
| Per-repo Qdrant collections  | Multiplies collections (N repos × M strategies = explosion) | Single collection with repo-tag payload filter  |
| Cross-repo refactoring tools | Write operations across repos are dangerous                 | Read-only search and context retrieval only     |
| Repo-level access control    | Auth/permissions per repo adds multi-tenancy                | Internal tool — all repos accessible to user    |
| Automatic cross-repo linking | Inferring repo relationships without config is fragile      | Explicit relationship declaration in config     |
| Real-time sync across repos  | Watching N repos for changes simultaneously is heavy        | On-demand indexing per repo via CLI             |

## Feature Dependencies

```
Multi-path config → Per-repo auto-detection → Unified indexing pipeline
                                            ↓
                              Repo-tagged Qdrant payloads → Unified search
                                            ↓
                              Source repo in MCP results → Repo-scoped filter
                                            ↓
Repo relationship config → Cross-repo dependency graph → Cross-repo expansion
```

**Critical path:** Config → Tagging → Search → Graph expansion

## MVP Recommendation

### Phase 1: Foundation (must ship first)

1. **Multi-path config** — Array of `{path, name, enabled}` in project.json
2. **Per-repo detection** — Run existing auto-detect per entry
3. **Repo-tagged payloads** — Add `repo_name` and `repo_path` to every Qdrant point
4. **Unified search** — Existing search tools query all repos, results include `repo` field

### Phase 2: Intelligence (builds on foundation)

5. **Repo-scoped filtering** — Optional `repo` param on search MCP tools
6. **Repo relationship config** — Declare "A depends on B"
7. **Cross-repo dependency expansion** — Follow imports into other indexed repos

### Defer to later

- **Cross-repo module graph** — Only needed for Maven multi-module split across repos; niche
- **Repo priority weighting** — Nice-to-have, can be added to search later without schema changes

## Complexity Assessment

| Feature Group           | Estimated Effort                         | Risk                                            |
| ----------------------- | ---------------------------------------- | ----------------------------------------------- |
| Config + detection      | Small (extend existing)                  | Low — additive change                           |
| Payload tagging         | Small (add field to indexer output)      | Low — backward compatible                       |
| Unified search          | Medium (filter logic, result formatting) | Low — Qdrant payload filtering is native        |
| MCP tool updates        | Small (propagate metadata)               | Low — additive fields                           |
| Cross-repo dep graph    | Large (resolve paths across repos)       | Medium — import resolution is language-specific |
| Independent re-indexing | Medium (index lifecycle per repo)        | Low — delete-by-filter + re-index               |

## Key Design Decisions Needed

1. **Single collection with repo tags vs. separate collections per repo?**
   - Recommend: Single collection + payload filter. Avoids collection explosion (repos × strategies). Qdrant payload filtering is fast with indexed fields.

2. **How to identify cross-repo imports?**
   - For Maven: `groupId:artifactId` in pom.xml maps to repo paths in config
   - For TypeScript/npm: package.json `name` field matches workspace/repo declarations
   - For Python: module paths need explicit mapping

3. **Backward compatibility with single-repo configs?**
   - Treat existing `projectPath` as single-entry array. No migration needed.

## Sources

- Existing ia-framework architecture (41 phases of validated patterns)
- Sourcegraph cross-repository code intelligence model (repo-scoped search, cross-repo navigation)
- Qdrant payload filtering documentation (indexed payload fields for fast filtering)
- PROJECT.md v1.7 milestone definition
