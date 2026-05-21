# Phase 42: Config & Repo Registry - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Developer can declare multiple repos in project.json with each independently detected for language, framework, and build tools. Each repo's `provides` field is auto-populated. Existing single-path project.json configs continue working without manual migration. Per-repo indexing and cross-repo search are separate phases (43-44).

</domain>

<decisions>
## Implementation Decisions

### Repo entry shape

- **D-01:** Minimal entry: `path` (required), `name` (optional alias), `provides` (auto-detected), `profile` (auto-detected). Indexing config stays global.
- **D-02:** `provides` is `string[]` — supports monorepos exporting multiple packages (e.g. from package.json workspaces or multi-module pom.xml).
- **D-03:** `name` is optional, auto-derived from directory basename if not specified (e.g. `/code/fi-connectors` -> `"fi-connectors"`).
- **D-04:** Repo paths are relative to project.json location (portable, team-friendly).

### Migration strategy

- **D-05:** Read-time normalization — `loadConfig()` detects old format (`targetProjectPath`) and normalizes to `repos[]` in memory. File stays untouched.
- **D-06:** `targetProjectPath` remains a valid field in schema (backward compat, autocomplete) but is normalized internally.
- **D-07:** If both `targetProjectPath` and `repos[]` are present, validation fails with a clear error.
- **D-08:** Internal representation is a `RepoRegistry` class that resolves paths, validates, and exposes normalized repo entries.
- **D-09:** New projects created via CLI/installer use `repos[]` format by default (multi-repo is the primary path).

### Detection behavior

- **D-10:** Detection runs on first load only. Results stored. Re-detect via explicit CLI command (e.g. `ia-framework detect`).
- **D-11:** Detection results written back to project.json inline (each repo entry gets `profile` and `provides` populated).
- **D-12:** Silent auto-detect — no interactive confirmation per repo. User can review in project.json or dashboard.
- **D-13:** If a declared repo path doesn't exist on disk, warn and skip that repo. Continue loading others.

### Naming & identity

- **D-14:** Repo names normalized to kebab-case, lowercase, alphanumeric + hyphens only.
- **D-15:** Duplicate derived names = validation error with guidance ("Add explicit `name` to disambiguate").
- **D-16:** Repo name is immutable once indexed — rename requires re-index.

### Agent's Discretion

- Exact RepoRegistry class API surface (methods, getters)
- Zod schema structure details (union vs discriminated union vs refine)
- Detection heuristics ordering (which files to check first)
- Warning message wording

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Config schema

- `packages/core/src/config/schema.ts` — Current ProjectConfigSchema with `targetProjectPath`, all existing Zod schemas
- `packages/core/src/config/loader.ts` — Current loadConfig() that needs normalization logic
- `packages/core/src/types/index.ts` — ProjectConfig interface and ProjectProfile type

### Requirements

- `.planning/REQUIREMENTS.md` — CONF-01 through CONF-04 define acceptance criteria

No external specs or ADRs — requirements fully captured in ROADMAP.md success criteria and decisions above.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `ProjectProfileSchema` (schema.ts): Already defines languages, frameworks, packageManager, testRunner, buildCommand, devCommand — reuse for per-repo profile
- `EmbeddingProviderConfigSchema`, `VectorStoreConfigSchema`: Remain global (not per-repo)
- `loadConfig()` + `validateConfig()`: Entry point for adding normalization layer

### Established Patterns

- Zod schemas with `.default()` and `.optional()` — new fields should follow same pattern
- Config is loaded once and passed through dependency injection (no global singleton)
- Types are inferred from Zod schemas where possible (`z.infer<typeof Schema>`)

### Integration Points

- `loadConfig()` return type changes from `ProjectConfig` to include `RepoRegistry` (or RepoRegistry wraps the config)
- All code currently accessing `config.targetProjectPath` needs to go through RepoRegistry
- Installer (`install.sh`) will need to generate `repos[]` format for new projects
- MCP server, indexer, and benchmark all consume `ProjectConfig` — they'll need to accept RepoRegistry

</code_context>

<specifics>
## Specific Ideas

- New projects should default to `repos[]` format from day one — legacy format is only for backward compat with existing users
- The RepoRegistry is the single source of truth for "what repos are configured" throughout the system

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 42-config-repo-registry_
_Context gathered: 2026-05-21_
