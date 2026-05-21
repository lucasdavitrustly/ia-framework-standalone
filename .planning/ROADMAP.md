# Roadmap — ia-framework

## Milestones

- ✅ **v1.0 MVP** — Phases 1–8 (shipped)
- ✅ **v1.1 LLM Chunking** — Phases 9–18 (shipped)
- ✅ **v1.2 Tuning & Observability** — Phases 19–21 (shipped)
- ✅ **v1.3 RAG Quality** — Phases 22–29 (shipped 2026-04-29)
- ✅ **v1.4 RAG Quality Improvements** — Phases 1–5, 30–32 (shipped 2026-04-30)
- ✅ **v1.5 RAG Retrieval Quality** — Phases 32, 37–39 (shipped 2026-05-15)
- ✅ **v1.6 RAG Retrieval Quality Improvements** — Phases 40–41 (shipped 2026-05-18)
- 🚧 **v1.7 Multi-Repo Indexing** — Phases 42–45 (in progress)

## Phases

<details>
<summary>✅ v1.0–v1.3 (Phases 1–29) — SHIPPED</summary>

See archived roadmaps in `.planning/milestones/`:

- `v1.2-ROADMAP.md` — covers v1.0 through v1.2
- `v1.3-ROADMAP.md` — covers v1.3

</details>

<details>
<summary>✅ v1.4 RAG Quality Improvements (Phases 1–5, 30–32) — SHIPPED 2026-04-30</summary>

- [x] Phase 1: Relevance Threshold (3/3 plans) — completed 2026-04-29
- [x] Phase 2: Hierarchy-Aware Chunking (2/2 plans) — completed 2026-04-29
- [x] Phase 3: Documentation Indexing (4/4 plans) — completed 2026-04-29
- [x] Phase 4: Query Intent Classification (3/3 plans) — completed 2026-04-29
- [x] Phase 5: Adaptive Retrieval Depth (3/3 plans) — completed 2026-04-29
- [x] Phase 30: Adaptive Decorator Chunking (3/3 plans) — completed 2026-04-30
- [x] Phase 31: Dynamic Retrieval Cost Cap (2/2 plans) — completed 2026-04-30
- [x] Phase 32: Relevance Score Threshold (1/1 plans) — completed 2026-05-14

</details>

<details>
<summary>✅ v1.5 RAG Retrieval Quality (Phases 32, 37–39) — SHIPPED 2026-05-15</summary>

- [x] Phase 32: Relevance Score Threshold (1/1 plans) — completed 2026-05-14
- [x] Phase 37: Query Complexity Classifier (2/2 plans) — completed 2026-05-15
- [x] Phase 38: Line-Number-Aware Chunking (1/1 plans) — completed 2026-05-15
- [x] Phase 39: Confidence-Based Early Exit (1/1 plans) — completed 2026-05-15

</details>

<details>
<summary>✅ v1.6 RAG Retrieval Quality Improvements (Phases 40–41) — SHIPPED 2026-05-18</summary>

- [x] Phase 40: Benchmark Preflight Tool (1/1 plans) — completed 2026-05-18
- [x] Phase 41: Hybrid Retrieval Tuning (1/1 plans) — completed 2026-05-18

</details>

### 🚧 v1.7 Multi-Repo Indexing (In Progress)

**Milestone Goal:** Support indexing and searching multiple repositories as a unified codebase, with cross-repo dependency graph expansion and source-tagged results.

- [ ] **Phase 42: Config & Repo Registry** - Multi-repo config schema with backward-compatible migration and RepoRegistry normalization
- [ ] **Phase 43: Per-Repo Indexing** - Repo-tagged Qdrant payloads with independent per-repo indexing
- [ ] **Phase 44: Unified Search & MCP** - Cross-repo search with source attribution in all MCP tools
- [ ] **Phase 45: Cross-Repo Dependency Graph** - Import resolution and dependency expansion across repo boundaries

## Phase Details

### Phase 42: Config & Repo Registry

**Goal**: Developer can declare multiple repos in project.json with each independently detected
**Depends on**: Nothing (first phase of v1.7)
**Requirements**: CONF-01, CONF-02, CONF-03, CONF-04
**Success Criteria** (what must be TRUE):

1. Developer can add a `repos[]` array to project.json with multiple local paths
2. Each repo entry shows auto-detected language, framework, and build tools after detection
3. Repo `provides` field is auto-populated from package.json name or pom.xml artifactId
4. Existing single-path project.json (with `targetProjectPath`) continues to work without manual migration
   **Plans**: TBD

### Phase 43: Per-Repo Indexing

**Goal**: Indexed chunks carry repo identity and repos can be re-indexed independently
**Depends on**: Phase 42
**Requirements**: INDX-01, INDX-02, INDX-03
**Success Criteria** (what must be TRUE):

1. Every indexed chunk in Qdrant has a `repoId` payload field identifying its source repo
2. Developer can re-index one repo (via CLI `--repo` flag) without affecting other repos' chunks
3. CLI `ia-framework index --repo <name>` indexes only the specified repo
   **Plans**: TBD

### Phase 44: Unified Search & MCP

**Goal**: All MCP search tools return results from all repos with clear source attribution
**Depends on**: Phase 43
**Requirements**: SRCH-01, SRCH-03, SRCH-04
**Success Criteria** (what must be TRUE):

1. `search_codebase` and `search_codebase_hybrid` return results from all indexed repos in a single query
2. Each search result displays repo name alongside file path (e.g. `[core] src/Payment.java`)
3. `get_file` and `get_dependencies` resolve files from any configured repo
4. MCP tool response JSON includes `repo` field in each result object
   **Plans**: TBD

### Phase 45: Cross-Repo Dependency Graph

**Goal**: Dependency graph expansion follows imports across repository boundaries
**Depends on**: Phase 44
**Requirements**: SRCH-02
**Success Criteria** (what must be TRUE):

1. When a file in repo A imports a symbol from repo B, dependency expansion includes the target file from repo B
2. `get_dependencies` for a file shows cross-repo imports with repo attribution
3. Search result expansion (expand_hops) traverses into other repos when following dependency edges
   **Plans**: TBD

## Progress

**Execution Order:** 42 → 43 → 44 → 45

| Phase                           | Milestone | Plans Complete | Status      | Completed  |
| ------------------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Relevance Threshold          | v1.4      | 3/3            | Complete    | 2026-04-29 |
| 2. Hierarchy-Aware Chunking     | v1.4      | 2/2            | Complete    | 2026-04-29 |
| 3. Documentation Indexing       | v1.4      | 4/4            | Complete    | 2026-04-29 |
| 4. Query Intent Classification  | v1.4      | 3/3            | Complete    | 2026-04-29 |
| 5. Adaptive Retrieval Depth     | v1.4      | 3/3            | Complete    | 2026-04-29 |
| 30. Adaptive Decorator Chunking | v1.4      | 3/3            | Complete    | 2026-04-30 |
| 31. Dynamic Retrieval Cost Cap  | v1.4      | 2/2            | Complete    | 2026-04-30 |
| 32. Relevance Score Threshold   | v1.5      | 1/1            | Complete    | 2026-05-14 |
| 37. Query Complexity Classifier | v1.5      | 2/2            | Complete    | 2026-05-15 |
| 38. Line-Number-Aware Chunking  | v1.5      | 1/1            | Complete    | 2026-05-15 |
| 39. Confidence-Based Early Exit | v1.5      | 1/1            | Complete    | 2026-05-15 |
| 40. Benchmark Preflight Tool    | v1.6      | 1/1            | Complete    | 2026-05-18 |
| 41. Hybrid Retrieval Tuning     | v1.6      | 1/1            | Complete    | 2026-05-18 |
| 42. Config & Repo Registry      | v1.7      | 0/?            | Not started | -          |
| 43. Per-Repo Indexing           | v1.7      | 0/?            | Not started | -          |
| 44. Unified Search & MCP        | v1.7      | 0/?            | Not started | -          |
| 45. Cross-Repo Dependency Graph | v1.7      | 0/?            | Not started | -          |
