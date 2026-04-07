---
quick_task: 260407-fzq
title: Create CLI command to generate starter benchmark corpus
subsystem: benchmark, cli
tags: [benchmark, corpus, llm, cli, rag]
key_files:
  created:
    - packages/benchmark/src/corpus-generator.ts
  modified:
    - packages/benchmark/src/index.ts
    - packages/cli/src/commands/benchmark.command.ts
decisions:
  - Used inline Node.js fs/readdir walk (no new deps) since @ia-framework/indexer is not a dep of @ia-framework/benchmark
  - Completion model defaults: gpt-4o-mini for OpenAI, llama3.2 for Ollama
  - Existing corpus backed up to .bak before overwrite (non-destructive)
  - validateCorpus() warnings are non-fatal (printed but don't exit 1)
  - Files not in sampled list are filtered out; empty non-negative queries re-categorized as neg-XX
metrics:
  duration: ~5 min
  completed: '2026-04-07T14:39:12Z'
  tasks_completed: 2
  files_created: 1
  files_modified: 2
---

# Quick Task 260407-fzq: Create CLI command to generate starter benchmark corpus

**One-liner:** LLM-powered `ia-framework benchmark init-corpus` command generates a 30-query project-specific benchmark corpus across 6 categories via OpenAI-compatible API.

## What Was Built

### Task 1: `generateCorpus()` in `packages/benchmark/src/corpus-generator.ts`

New `generateCorpus()` function that:

1. Walks the target project's source files using a lightweight inline recursive fs walker
2. Samples up to 60 files (shuffled), converts to relative paths, groups by top-level directory
3. Calls an OpenAI-compatible `/v1/chat/completions` API with a structured prompt
4. Parses LLM JSON response (strips markdown code fences if present)
5. Validates each non-negative query's `expectedFiles` against disk (removes non-existent files)
6. Re-categorizes queries with empty `expectedFiles` to `neg-XX` IDs

The 6 categories generated:

- `sem-01..05` — semantic (conceptual/functional questions)
- `kw-01..05` — keyword (exact symbol/class lookups)
- `xf-01..05` — cross-file (2+ files in expectedFiles)
- `cx-01..05` — complex (multi-concept retrieval)
- `neg-01..05` — negative (topics NOT in codebase, empty expectedFiles)
- `edge-01..05` — edge-case (boundary/failure behaviors)

**Exported interface:**

```typescript
export interface CorpusGeneratorOptions {
  targetProjectPath: string;
  completionBaseUrl: string;
  completionApiKey: string;
  completionModel: string;
}
export async function generateCorpus(options: CorpusGeneratorOptions): Promise<BenchmarkQuery[]>;
```

### Task 2: `init-corpus` subcommand in `packages/cli/src/commands/benchmark.command.ts`

New `initCorpusSubcommand()` registered via `benchmark.addCommand()` with:

- `--config <path>` — path to project.json
- `--corpus <path>` — output path (default: `.ia-framework/benchmark-queries.json`)
- `--model <model>` — completion model override
- `--force` — skip backup (backup created by default)

**Flow:**

1. Load config → determine corpus path
2. Backup existing corpus to `.bak` if present
3. Auto-select completion model (`gpt-4o-mini` for OpenAI, `llama3.2` for Ollama)
4. Call `generateCorpus()` → write flat JSON array (2-space pretty-print)
5. Run `validateCorpus()` — print warnings but don't exit 1
6. Print category breakdown summary

## Commits

| Task   | Commit    | Description                                                              |
| ------ | --------- | ------------------------------------------------------------------------ |
| Task 1 | `47fc1e5` | feat(quick-260407-fzq): implement generateCorpus() in packages/benchmark |
| Task 2 | `3a7a87e` | feat(quick-260407-fzq): add init-corpus subcommand to benchmark CLI      |

## Deviations from Plan

### Auto-applied decisions

**1. [Rule 1 - Design] Inline fs walker instead of tinyglobby import**

- **Found during:** Task 1
- **Issue:** `tinyglobby` is not a declared dependency of `@ia-framework/benchmark` and adding it would require modifying `package.json`. `@ia-framework/indexer` (which uses it) is also not a benchmark dependency.
- **Fix:** Implemented a 50-line inline recursive `walkSourceFiles()` using Node.js built-in `fs/promises` `readdir`. Matches the behavior of the indexer's walker (same SKIP_DIRS, SOURCE_EXTENSIONS, exclusion patterns for test/generated/declaration files).
- **Files modified:** `packages/benchmark/src/corpus-generator.ts`

**2. [Rule 3 - Blocking] Build benchmark before CLI typecheck**

- **Found during:** Task 2
- **Issue:** LSP errors for `generateCorpus` and `CorpusGeneratorOptions` in the CLI because the benchmark dist hadn't been rebuilt yet.
- **Fix:** Ran `pnpm --filter @ia-framework/benchmark build` before CLI typecheck. Post-build, all types resolved and `pnpm --filter @ia-framework/cli exec tsc --noEmit` passed cleanly.

## Known Stubs

None — the implementation is complete. The only LLM dependency is the external completion API, which is correctly configured via `config.embedding.baseUrl` and `config.embedding.apiKey`.

## Self-Check

### Created files exist

- ✓ `packages/benchmark/src/corpus-generator.ts` — exists
- ✓ `packages/benchmark/src/index.ts` — updated

### Commits exist

- ✓ `47fc1e5` — feat(quick-260407-fzq): implement generateCorpus()
- ✓ `3a7a87e` — feat(quick-260407-fzq): add init-corpus subcommand

### CLI verification

- ✓ `ia-framework benchmark --help` lists `init-corpus`
- ✓ `ia-framework benchmark init-corpus --help` shows all 4 options: `--model`, `--corpus`, `--force`, `--config`

## Self-Check: PASSED
