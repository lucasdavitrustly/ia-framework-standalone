---
quick_task: 260407-gad
title: CLI corpus — default to local Ollama model, guard target project path
phase: quick
plan: 01
status: complete
date: '2026-04-07'
duration: ~2min
tasks_completed: 1
tasks_total: 1
files_modified: 1
commit: d2893d8
tags: [cli, benchmark, ollama, safety]

key-files:
  modified:
    - packages/cli/src/commands/benchmark.command.ts

key-decisions:
  - Default Ollama probe uses /api/tags (not /api/embed) — lightweight HEAD-equivalent check that confirms daemon is running
  - Framework repo guard uses three-marker heuristic (packages/ + apps/ + turbo.json) to avoid false positives on other monorepos that only have packages/ or apps/
  - modelExplicit flag (options.model !== undefined) used throughout — avoids ambiguity between "no model passed" and empty string
  - OLLAMA_DEFAULT_BASE_URL + OLLAMA_DEFAULT_MODEL exported as module-level constants for easy future configuration
---

# Quick Task 260407-gad: CLI corpus — default to local Ollama, guard target project path

**One-liner:** Added three safety behaviors to `ia-framework benchmark init-corpus`: always default to Ollama `llama3.2` when `--model` not provided, probe `/api/tags` before calling LLM with actionable error if unreachable, and reject runs where `targetProjectPath` is the ia-framework repo itself.

## What Was Done

Modified `initCorpusSubcommand()` in `packages/cli/src/commands/benchmark.command.ts` with three distinct safety improvements:

### Change 1 — Ollama Default (always, not config-dependent)

Previous behavior: default model depended on `config.embedding.provider` (ollama → llama3.2, otherwise → gpt-4o-mini), and `completionBaseUrl` came from `config.embedding.baseUrl`.

New behavior: when `--model` is **not** explicitly passed, always use `http://localhost:11434` + `llama3.2` regardless of embedding config. When `--model` IS explicitly passed, fall back to configured provider settings (user intent is clear).

```
No --model flag → Ollama (llama3.2 @ localhost:11434)
--model gpt-4o-mini → uses config.embedding.baseUrl, skips Ollama probe
```

### Change 2 — Ollama Availability Probe

Before calling `generateCorpus()`, when using the Ollama default path, a `GET /api/tags` request with 3-second timeout is made. If Ollama is not reachable, exits with:

```
✗ Ollama not reachable at http://localhost:11434
  To generate corpus with a local model:
  1. Install Ollama: https://ollama.com
  2. Pull the model: ollama pull llama3.2
  3. Re-run: ia-framework benchmark init-corpus

  To use a cloud model instead, pass --model explicitly:
  ia-framework benchmark init-corpus --model gpt-4o-mini
```

### Change 3 — Target Project Guard

Added `isFrameworkRepo(targetPath)` async helper that checks for `packages/`, `apps/`, and `turbo.json` at the root — the ia-framework monorepo signature. Called immediately after `loadConfig()`, before any backup or generation work. If triggered, exits with:

```
✗ targetProjectPath appears to be the ia-framework repo itself:
  /path/to/ia-framework

  Corpus generation must target YOUR project, not the ia-framework tool.
  Update 'targetProjectPath' in .ia-framework/project.json to point at your project.
```

### Additional: Model Source Indicator

Log output now shows whether Ollama is being used as default or via explicit flag:

```
Using completion model: llama3.2 via http://localhost:11434 (default local)
Using completion model: gpt-4o-mini via https://api.openai.com (explicit --model)
```

## Verification

- TypeScript compiles without errors (`pnpm --filter @ia-framework/cli exec tsc --noEmit` — clean)
- `ia-framework benchmark init-corpus --help` shows all 4 options correctly
- Code defaults to `http://localhost:11434` + `llama3.2` when `--model` not passed ✓
- Ollama probe uses `/api/tags` with `AbortSignal.timeout(3000)` before calling generateCorpus ✓
- `isFrameworkRepo` guard runs immediately after `loadConfig()`, before any other work ✓
- Explicit `--model` path skips Ollama probe entirely ✓

## Commits

| Hash    | Message                                                                                    |
| ------- | ------------------------------------------------------------------------------------------ |
| d2893d8 | feat(quick-260407-gad): default corpus to Ollama, probe availability, guard framework repo |

## Deviations from Plan

None — plan executed exactly as written. The `isUsingOllama` variable mentioned in the plan was simplified to a direct `!modelExplicit` check (the probe block is already gated on `!modelExplicit` making the extra variable redundant). No functional difference.

## Self-Check: PASSED

- ✓ `packages/cli/src/commands/benchmark.command.ts` — exists
- ✓ commit `d2893d8` — confirmed in git log
- ✓ `.planning/quick/260407-gad-cli-corpus-default-to-local-ollama-model/260407-gad-SUMMARY.md` — exists
