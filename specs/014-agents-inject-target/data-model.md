# Phase 1 Data Model: Configurable Agent Docs Injection Targets

## Entity: RepoEntry (extended)

Location: `packages/core/src/types/index.ts` (`RepoEntry`) and `packages/core/src/config/schema.ts` (`RepoEntrySchema`).

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `path` | string (min 1) | yes | — | Repo path, resolved to absolute against config dir at runtime. |
| `name` | string (kebab-case) | no | derived from `basename(path)` | Logical name; must be unique across repos. |
| `provides` | string[] | no | detected | Package names for cross-repo symbol resolution. |
| `profile` | ProjectProfile | no | detected | Per-repo tech profile. |
| **`injectAgents`** | **boolean** | **no** | **`false`** | **NEW. `true` marks this repo as an agent-docs injection target. Absent/null → `false` (opt-in only).** |

**Validation rules**:
- `injectAgents` MUST be a boolean when present (Zod type error otherwise → FR-009).
- Absent, `null`, or `undefined` → treated as `false` (FR-001a).
- No change to existing uniqueness/`name` rules.

## Entity: ProjectConfig (unchanged shape, extended semantics)

Location: `packages/core/src/config/schema.ts` (`ProjectConfigSchema`).

- Still requires exactly one of `targetProjectPath` XOR `repos[]` (existing `.refine`).
- Legacy `targetProjectPath` form is **implicitly opted-in** for injection (no `injectAgents` field exists in that form) — FR-008.
- `repos[]` form: injection targets are the subset with `injectAgents === true`.
- **NEW — `agentInjectionTargets?: string[]`** (optional, top-level): additional injection-only paths that are NOT part of the index (US5 / FR-017/FR-018). Resolved relative to the config dir. Never indexed.

## Entity: InjectionTarget (derived, in-memory)

Produced by `RepoRegistry.getInjectionTargets()` (or a dedicated resolver). A normalized target (absolute `path`, resolved `name`) selected for injection.

**Selection logic**:
```
if config uses targetProjectPath (legacy):
    targets = [the single synthesized entry]        # implicitly opted-in
else (repos[]):
    targets = repos.filter(r => r.injectAgents === true)
# US5: always union the extra non-indexed targets
targets += (config.agentInjectionTargets ?? []).map(p => ({ path: resolve(configDir, p), indexed: false }))
dedupe targets by resolved absolute path             # edge case: same location twice
```

## Entity: InjectionResult (new, in-memory / reported)

Per-target outcome surfaced to the user (FR-011). Not persisted.

| Field | Type | Notes |
|-------|------|-------|
| `repoName` | string | Logical repo name. |
| `targetFile` | string | Absolute path of the agent doc file acted upon. |
| `status` | `'injected' \| 'refreshed' \| 'created' \| 'skipped' \| 'failed'` | `created` = file created; `injected` = markers added to existing file; `refreshed` = existing markers replaced; `skipped` = not a target / deduped; `failed` = path missing/inaccessible or write error. |
| `error` | string \| undefined | Populated when `status === 'failed'`. |

**State transitions (per target file)**:
```
no file            → created
file, no markers   → injected
file, has markers  → refreshed   (idempotent; content replaced between markers)
path inaccessible  → failed      (run continues with remaining targets — FR-012)
```

## Entity: Injected Guidance Block (content, extended)

The marker-delimited string written into each target's agent doc file.

- Markers: `<!-- ia-framework:rag-start -->` … `<!-- ia-framework:rag-end -->` (unchanged).
- Sections (all inside the single block):
  1. Codebase RAG Tools (existing: `search_codebase` / `get_file` / `get_dependencies`).
  2. **Context7 usage guidance (NEW — FR-013)**.
  3. **Sequential Thinking usage guidance (NEW — FR-014)**.
- Refresh replaces the entire block, so all three sections update together with no duplication (FR-015, SC-008).

## Relationships

- `ProjectConfig` 1—N `RepoEntry` (via `repos[]`) OR 1—1 legacy `targetProjectPath`.
- `RepoRegistry` normalizes `ProjectConfig` → N `RepoEntry`; filters → M `InjectionTarget` (M ≤ N).
- Each `InjectionTarget` → 1 `InjectionResult` per run.
- Each acted-upon target file contains exactly 1 Injected Guidance Block.
