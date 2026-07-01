# Phase 0 Research: Configurable Agent Docs Injection Targets

All spec ambiguities were resolved during `/speckit.clarify` (see spec §Clarifications). No open `NEEDS CLARIFICATION` items remain. This document records the grounded implementation decisions derived from the current codebase.

## D-01: Designation mechanism — `injectAgents` boolean on each `repos[]` entry

- **Decision**: Add an optional `injectAgents: boolean` field to `RepoEntry` (and its Zod `RepoEntrySchema`). A repo is an injection target iff `injectAgents === true`. Default and absent/null → `false` (opt-in only).
- **Rationale**: Matches the clarified answer (Q1). Co-locates the choice with the repo entry it affects; supports zero/one/some/all selection with no second list to keep in sync. Fits the existing `RepoEntry` shape (`path`/`name`/`provides`/`profile`) in `packages/core/src/types/index.ts:190` and `RepoEntrySchema` in `packages/core/src/config/schema.ts:133`.
- **Alternatives considered**: (B) top-level `agentInjectionTargets: string[]` referencing names — rejected: duplicates the repo list and can drift out of sync; (C) nested `agents: { inject, file }` object — rejected as speculative (YAGNI, Principle V); a single boolean covers the requirement.

## D-02: Selection resolution lives in `RepoRegistry`

- **Decision**: Add `RepoRegistry.getInjectionTargets(): RepoEntry[]` returning entries where `injectAgents === true`. For legacy `targetProjectPath` configs (no `repos[]`), the single synthesized entry is treated as implicitly opted-in and returned by `getInjectionTargets()`.
- **Rationale**: `RepoRegistry.fromConfig()` (`packages/core/src/config/registry.ts:19`) already normalizes both formats into `RepoEntry[]`, resolves paths, and derives names. Centralizing selection there keeps the CLI thin and gives one tested code path for both the installer and the standalone command (FR-010). Satisfies clarified Q2 (legacy implicitly opted-in) and Q1 (opt-in default false).
- **Alternatives considered**: Resolving selection inline in the CLI — rejected: would duplicate legacy-vs-new logic and bypass registry tests.

## D-03: `RepoRegistry.toJSON()` must preserve `injectAgents`

- **Decision**: Extend `toJSON()` (`registry.ts:77`) to include `injectAgents` when defined, alongside the existing conditional spread of `provides`/`profile`.
- **Rationale**: The installer's zero-flag fallback prompt persists chosen flags back to `project.json`. `toJSON()` currently *drops* any field not explicitly listed, so it would silently strip a user's `injectAgents` on any rewrite. This is a real regression risk identified in code review and must be handled.
- **Alternatives considered**: Writing the flag through a separate ad-hoc JSON edit — rejected: bypasses the single serialization path and risks inconsistency.

## D-04: Injection command iterates targets and reports per-target results

- **Decision**: The `inject` subcommand (`agents.command.ts:291`) resolves targets via `getInjectionTargets()`, then for each target auto-detects the agent doc file (existing `AGENTS.md` → else `CLAUDE.md` → else create `AGENTS.md`) and calls the existing `injectIntoFile()`. It collects a per-target `InjectionResult` (`injected` | `refreshed` | `created` | `skipped` | `failed`) and prints a summary. When zero targets resolve, it prints a "no injection target configured" message and exits without modifying files (FR-004). The `--file` and `--config` overrides are preserved; `--file` forces a single explicit target.
- **Rationale**: `injectIntoFile()` (`agents.command.ts:249`) is already idempotent via `RAG_MARKER_START/END` and handles create/replace/append. Reusing it satisfies FR-006/FR-007 with no new logic. Per-target continue-on-error satisfies FR-011/FR-012.
- **Alternatives considered**: Aborting the whole run on the first failed target — rejected by FR-012 (must continue).

## D-05: Standalone CLI never prompts; installer owns the fallback prompt

- **Decision**: The CLI `inject`/`check` subcommands are fully non-interactive. The zero-flag fallback multi-select prompt lives only in `install.sh` (Step 6.5), reusing `prompt_toggle_select` from `scripts/installer-helpers.sh`. After the user selects, the installer writes the flags to `project.json` (via the core serialization path / a small helper) and then invokes `ia-framework agents inject`.
- **Rationale**: Matches clarified Q3 (hybrid) and FR-010/FR-010a. `prompt_toggle_select` (`installer-helpers.sh:73`) already implements checkbox multi-select with all/none/confirm-zero semantics — ideal and avoids new prompt code (Principle V). Keeping the CLI non-interactive preserves scriptability and idempotent CI runs.
- **Alternatives considered**: A CLI `--interactive` flag — rejected: expands CLI surface and duplicates installer UX; not requested.

## D-06: Extend the injected guidance block with Context7 + Sequential Thinking

- **Decision**: Append two clearly-headed subsections to the `RAG_CONTENT` string (`agents.command.ts:9`), inside the same `ia-framework:rag-start/end` markers: (1) "When to use Context7" — up-to-date library/framework/SDK/API/CLI docs; resolve library ID first, prefer over web search for library specifics; not for refactoring/general concepts. (2) "When to use Sequential Thinking" — structured, multi-step, revisable reasoning; and when NOT to (trivial single-step changes).
- **Rationale**: FR-013–FR-016 + SC-007/SC-008. Because the content lives inside the existing marker block, a re-run refreshes all three guidance areas together with no duplication (FR-015), and older blocks lacking the new sections converge on re-inject (SC-008). Content is self-contained (FR-016). Source guidance mirrors the descriptions in this repo's own `AGENTS.md` MCP instructions for consistency.
- **Alternatives considered**: A separate second marker block — rejected: two blocks complicate refresh/idempotency and violate FR-015.

## D-07: Backward compatibility & validation

- **Decision**: `injectAgents` is optional in the schema, so existing `repos[]` entries and legacy `targetProjectPath` configs validate unchanged (FR-008). Malformed designations are surfaced by Zod (wrong type) and by existing registry checks (e.g. duplicate names at `registry.ts:37`). `--file` targeting a repo not in config is still allowed as an explicit override.
- **Rationale**: FR-009 asks for clear, actionable errors on malformed designation; Zod 4 already produces field-path errors via `loadConfig`/`validateConfig` (`loader.ts:12`).
- **Alternatives considered**: Custom hand-rolled validation — rejected: Zod is the constitution-mandated validation layer.

## Summary of decisions

| ID | Area | Decision |
|----|------|----------|
| D-01 | Config shape | `injectAgents?: boolean` on `RepoEntry`, default/absent → false |
| D-02 | Selection | `RepoRegistry.getInjectionTargets()`; legacy target implicitly opted-in |
| D-03 | Serialization | `toJSON()` preserves `injectAgents` |
| D-04 | CLI behavior | Iterate targets, idempotent inject, per-target result summary, no-target report |
| D-05 | Interaction | CLI non-interactive; installer owns zero-flag fallback prompt (reuse `prompt_toggle_select`) |
| D-06 | Injected content | Add Context7 + Sequential Thinking guidance inside existing marker block |
| D-07 | Compatibility | Optional field; Zod-driven validation; legacy preserved |
