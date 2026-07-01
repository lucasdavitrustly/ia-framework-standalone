# Implementation Plan: Configurable Agent Docs Injection Targets

**Branch**: `014-agents-inject-target` | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-agents-inject-target/spec.md`

## Summary

Today `ia-framework agents inject` (invoked by `install.sh` Step 6.5) picks its target implicitly — `config.targetProjectPath ?? config.repos?.[0]?.path` — so in a multi-repo `project.json` only the *first* repo is ever touched, with no user control. This feature makes injection **opt-in per repo** via a new `injectAgents` boolean flag on each `repos[]` entry (default `false`; absent/unavailable → `false`). The injection command iterates all flagged repos, injects/refreshes the marker-delimited guidance block in each, and reports a per-target result summary. Legacy `targetProjectPath` configs stay implicitly opted-in (unchanged behavior). The installer stays non-interactive when ≥1 repo is flagged and adds a single fallback multi-select prompt only when zero repos are flagged, persisting chosen flags back to `project.json`. The injected guidance block is also extended to document Context7 and Sequential Thinking usage alongside the existing codebase RAG tools.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js >= 22 (per constitution). Installer glue in POSIX `sh`/bash.

**Primary Dependencies**: Zod 4 (config schema validation), Commander.js (CLI), Vitest (tests). No new runtime dependencies (Simplicity / no-new-deps).

**Storage**: `project.json` under `.ia-framework/` (JSON file, edited by loader/registry and installer scripts). No database involvement.

**Testing**: Vitest, test files co-located as `*.test.ts`. Existing suites: `schema.test.ts`, `registry.test.ts`, `loader.test.ts`, `agents.command.test.ts`.

**Target Platform**: Local developer machines (macOS/Linux) — local-first CLI + installer.

**Project Type**: pnpm monorepo; changes span `packages/core` (config) and `packages/cli` (agents command) plus root `install.sh` / `scripts/`.

**Performance Goals**: N/A — injection is a handful of local file reads/writes per run; not on any hot path.

**Constraints**: Idempotent (marker-based, no duplication); backward compatible with legacy `targetProjectPath` and with `repos[]` entries lacking the flag; the standalone CLI must never prompt.

**Scale/Scope**: Typically 1–10 repos per `project.json`. Small, bounded change surface.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| I. TDD (Non-Negotiable) | PASS — new behavior covered by Vitest tests written first: schema accepts/validates `injectAgents`, registry preserves flag, target selection (none/some/all/legacy), injection idempotency, per-target result summary, extended guidance content present. |
| II. TypeScript-Only | PASS — all source changes in TS strict; Zod 4 extends `RepoEntrySchema`; new `injectAgents?: boolean` on `RepoEntry`. |
| III. Local-First | PASS — no external service; local file edits only. |
| IV. Monorepo Architecture | PASS — respects package boundaries: schema/types/registry in `@ia-framework/core`, injection logic in CLI; no circular deps; public API via barrel exports. |
| V. Simplicity & No Heavy Abstractions | PASS — a single boolean flag + iteration; no new abstraction layer, no new dependency. Reuses existing `prompt_toggle_select` bash helper for the installer fallback. |
| VI. Incremental by Default | N/A to indexing; injection is already idempotent/incremental via markers. Preserved. |
| VII. MCP-First Interface | N/A — this feature is CLI/installer + injected-doc content, not an MCP tool. No MCP contract changes. |

**Result**: PASS (no violations; Complexity Tracking not required).

## Project Structure

### Documentation (this feature)

```text
specs/014-agents-inject-target/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (config + CLI contracts)
│   ├── repo-entry.schema.json
│   └── agents-inject.cli.md
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/core/src/
├── types/index.ts               # RepoEntry: add `injectAgents?: boolean`
├── config/
│   ├── schema.ts                # RepoEntrySchema: add injectAgents (default false)
│   ├── schema.test.ts           # flag accepted / defaulted / typed
│   ├── registry.ts              # RepoRegistry: carry injectAgents through fromConfig + toJSON;
│   │                            #   add getInjectionTargets(); legacy target implicitly opted-in
│   ├── registry.test.ts         # selection: none/some/all + legacy + toJSON preserves flag
│   └── loader.ts                # unchanged (validation flows through schema)

packages/cli/src/commands/
├── agents.command.ts            # RAG_CONTENT: append Context7 + Sequential Thinking guidance;
│                                #   inject subcommand: iterate flagged repos, per-target results,
│                                #   no-target report; keep --file/--config overrides; no prompting
└── agents.command.test.ts       # multi-target inject, no-target report, refresh idempotency,
                                 #   extended guidance content assertions

install.sh                       # Step 6.5: call updated inject; zero-flag fallback prompt wiring
scripts/
├── installer-helpers.sh         # reuse prompt_toggle_select (no change expected)
└── init-config.sh               # (only if flag needs seeding in generated repos[])
```

**Structure Decision**: Monorepo, two packages. Config model (`RepoEntry` + Zod schema + `RepoRegistry`) lives in `@ia-framework/core`; target-selection + injection + report and the extended guidance content live in `@ia-framework/cli`. Installer orchestration (fallback prompt + write-back) is in root `install.sh` reusing existing `scripts/installer-helpers.sh` prompts. This matches the current placement of `agents.command.ts` and the config layer, introducing no new package.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
