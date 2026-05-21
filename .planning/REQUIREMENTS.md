# Requirements: ia-framework v1.7

**Defined:** 2026-05-21
**Core Value:** AI that actually understands the codebase — better context means better code output.

## v1 Requirements

Requirements for milestone v1.7 Multi-Repo Indexing.

### Configuration

- [ ] **CONF-01**: Developer can configure multiple repo paths in project.json as an array
- [ ] **CONF-02**: Each repo entry is independently auto-detected for language, framework, and build tools
- [ ] **CONF-03**: Repo `provides` field auto-populated from package.json name or pom.xml artifactId
- [ ] **CONF-04**: Existing single-path project.json config migrates seamlessly (backward compat)

### Indexing

- [ ] **INDX-01**: Indexed chunks are tagged with source repo identifier in Qdrant payload
- [ ] **INDX-02**: Developer can re-index a single repo without re-indexing others
- [ ] **INDX-03**: CLI accepts `--repo` flag to scope indexing to a specific repo

### Search

- [ ] **SRCH-01**: search_codebase and search_codebase_hybrid always query all repos, results include repo origin
- [ ] **SRCH-02**: Dependency graph expansion crosses repo boundaries
- [ ] **SRCH-03**: get_file and get_dependencies resolve files across all configured repos
- [ ] **SRCH-04**: Search results display repo name alongside file path (e.g. `[core] src/Payment.java`)

## Future Requirements

### Dashboard

- **DASH-01**: Per-repo indexing status display
- **DASH-02**: Per-repo metrics breakdown in analytics

### Search Refinement

- **SRCH-05**: Optional repo filter parameter on MCP search tools for targeted search

## Out of Scope

| Feature                          | Reason                                                                      |
| -------------------------------- | --------------------------------------------------------------------------- |
| Remote repo cloning/fetching     | Internal tool — repos are local paths only                                  |
| Auto-discovery of repos          | Explicit config — developer controls what's indexed                         |
| Real-time file sync across repos | On-demand indexing is sufficient                                            |
| Per-repo Qdrant collections      | Shared collection with payload filter is simpler and enables unified search |
| Dashboard multi-repo UI          | Deferred to future milestone — focus on core indexing/search first          |

## Traceability

| Requirement | Phase | Status  |
| ----------- | ----- | ------- |
| CONF-01     | —     | Pending |
| CONF-02     | —     | Pending |
| CONF-03     | —     | Pending |
| CONF-04     | —     | Pending |
| INDX-01     | —     | Pending |
| INDX-02     | —     | Pending |
| INDX-03     | —     | Pending |
| SRCH-01     | —     | Pending |
| SRCH-02     | —     | Pending |
| SRCH-03     | —     | Pending |
| SRCH-04     | —     | Pending |

**Coverage:**

- v1 requirements: 11 total
- Mapped to phases: 0
- Unmapped: 11 ⚠️

---

_Requirements defined: 2026-05-21_
_Last updated: 2026-05-21 after initial definition_
