---
phase: quick
plan: 260407-fzq
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/benchmark/src/corpus-generator.ts
  - packages/benchmark/src/index.ts
  - packages/cli/src/commands/benchmark.command.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - 'Running `ia-framework benchmark init-corpus` against an indexed project generates a 30-query benchmark-queries.json'
    - 'Generated questions reference real files that exist in the target project'
    - '30 questions are distributed across 6 categories: semantic (5), keyword (5), cross-file (5), complex (5), negative (5), edge-case (5)'
    - 'If benchmark-queries.json already exists, it is backed up before overwrite'
    - 'Generated corpus passes validateCorpus() with 0 errors'
  artifacts:
    - path: 'packages/benchmark/src/corpus-generator.ts'
      provides: 'generateCorpus() function — LLM-powered 30-query generator'
      exports: ['generateCorpus', 'CorpusGeneratorOptions']
    - path: 'packages/cli/src/commands/benchmark.command.ts'
      provides: 'init-corpus subcommand wired into ia-framework benchmark'
      contains: 'init-corpus'
  key_links:
    - from: 'packages/cli/src/commands/benchmark.command.ts'
      to: 'packages/benchmark/src/corpus-generator.ts'
      via: 'import generateCorpus'
    - from: 'packages/benchmark/src/corpus-generator.ts'
      to: 'packages/indexer/src/file-walker.ts'
      via: 'walkFiles() to discover real project files'
    - from: 'packages/benchmark/src/corpus-generator.ts'
      to: 'OpenAI-compatible /v1/chat/completions API'
      via: 'fetch to completion model endpoint'
---

<objective>
Add `ia-framework benchmark init-corpus` CLI subcommand that analyzes the target project's indexed codebase and uses an LLM to generate a project-specific 30-question benchmark corpus.

Purpose: The current `benchmark run` command creates a generic placeholder corpus (3 generic example queries). Developers need a real corpus grounded in their actual codebase to meaningfully benchmark RAG quality. Manual corpus creation is tedious — an LLM-powered generator can produce 30 well-structured, project-specific queries in seconds.

Output:

- `packages/benchmark/src/corpus-generator.ts` — `generateCorpus()` function
- Updated `packages/benchmark/src/index.ts` — export new function
- Updated `packages/cli/src/commands/benchmark.command.ts` — `init-corpus` subcommand
  </objective>

<execution_context>
@~/.config/opencode/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

Key interfaces (do not re-derive from codebase — use these directly):

```typescript
// packages/benchmark/src/types.ts
export interface BenchmarkQuery {
  id: string;         // e.g. "sem-01"
  query: string;      // Natural language query
  expectedFiles: string[];  // Relative paths from project root. Empty for negative queries.
  description?: string;
}

// packages/core/src/config/schema.ts — ProjectConfig shape used in CLI
{
  targetProjectPath: string;        // Absolute path to target project
  embedding: {
    provider: 'openai' | 'ollama';
    model: string;
    baseUrl?: string;
    apiKey?: string;
  };
}
```

```typescript
// packages/indexer/src/file-walker.ts
export async function walkFiles(options: {
  projectPath: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  respectGitignore?: boolean;
}): Promise<string[]>; // Returns absolute paths
```

```typescript
// packages/benchmark/src/corpus.ts — existing exports used in CLI
export async function validateCorpus(
  queries: BenchmarkQuery[],
  projectRoot: string,
): Promise<CorpusValidationError[]>;
export async function loadCorpus(filePath: string): Promise<BenchmarkQuery[]>;
export class CorpusNotFoundError extends Error {
  filePath: string;
}
```

```typescript
// packages/cli/src/commands/benchmark.command.ts — CLI pattern to follow
import { loadConfig, createLogger } from '@ia-framework/core';
// getConfigPath() helper already defined — reuse it
function getConfigPath(options: { config?: string }): string;
// benchmarkCommand() is the Commander group — add subcommand with benchmark.addCommand(initCorpusSubcommand())
```

</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement generateCorpus() in packages/benchmark/src/corpus-generator.ts</name>
  <files>packages/benchmark/src/corpus-generator.ts, packages/benchmark/src/index.ts</files>
  <action>
Create `packages/benchmark/src/corpus-generator.ts` with the `generateCorpus()` function.

**Algorithm:**

1. Walk the target project files using `walkFiles()` from `@ia-framework/indexer` (import as relative path `../../indexer/src/file-walker.js` OR use the package — check if indexer is a workspace dep of benchmark; if not, use direct fetch/fs scan as fallback). **Check `packages/benchmark/package.json` to see available deps first.** If `@ia-framework/indexer` is not listed, add it OR use a simpler approach: just use Node.js `glob` from `tinyglobby` directly (it IS available — check the indexer package).

**Simplest correct approach:** Import `walkFiles` from `@ia-framework/indexer` if that package is a workspace dependency of benchmark. If not, copy just the tinyglobby-based walk inline (10 lines). Choose whichever avoids modifying `package.json`.

2. Sample up to 60 files from the walk results (shuffle, take first 60) — these become the "context" for the LLM. Format as relative paths from project root (strip the absolute prefix).

3. Group sampled files loosely by directory/pattern for LLM context (show the structure, not just a flat list).

4. Call OpenAI-compatible completion API (`/v1/chat/completions`) using `fetch`. Use the config's `embedding.baseUrl` (default `https://api.openai.com`) and `embedding.apiKey`. The completion **model** is configurable via `--model` CLI option (default: `gpt-4o-mini` for OpenAI, `llama3.2` for Ollama). This is separate from the embedding model.

5. System prompt instructs LLM to produce exactly 30 queries as a JSON array matching `BenchmarkQuery[]`. Provide the 6 categories and 5 query requirement per category. Categories:
   - `sem-01..05` — semantic: conceptual/functional questions ("how does X work")
   - `kw-01..05` — keyword: exact class/function name searches ("ClassName method lookup")
   - `xf-01..05` — cross-file: questions requiring 2+ files ("how X connects to Y")
   - `cx-01..05` — complex: multi-concept retrieval ("error handling when A fails during B")
   - `neg-01..05` — negative: topics NOT in the codebase (empty `expectedFiles: []`), infer from missing patterns
   - `edge-01..05` — edge-case: unusual/boundary behaviors ("what happens when X is missing/empty/fails")

6. Parse LLM JSON response. Strip markdown code fences if present. Validate JSON parses as array.

7. For non-negative queries: verify each expectedFile exists on disk (use `fs.access`). Remove files that don't exist. If a query ends up with empty expectedFiles but was not a negative query, re-categorize it as negative (update its ID to `neg-XX` if needed) OR remove it.

8. Return validated `BenchmarkQuery[]`.

**Interface to export:**

```typescript
export interface CorpusGeneratorOptions {
  targetProjectPath: string;
  completionBaseUrl: string; // e.g. "https://api.openai.com" or Ollama URL
  completionApiKey: string; // empty string for Ollama
  completionModel: string; // e.g. "gpt-4o-mini" or "llama3.2"
}

export async function generateCorpus(options: CorpusGeneratorOptions): Promise<BenchmarkQuery[]>;
```

**LLM prompt requirements:**

- System: "You are a benchmark corpus generator. Return ONLY a JSON array, no markdown, no explanations."
- User: "Given this project file structure:\n\n{fileList}\n\nGenerate exactly 30 benchmark queries for testing a code retrieval system. Return a JSON array of objects with exactly these fields: id, query, expectedFiles (array of relative file paths that MUST exist in the list above), description. Use these IDs: sem-01 to sem-05 (semantic), kw-01 to kw-05 (keyword/symbol), xf-01 to xf-05 (cross-file, use 2+ files in expectedFiles), cx-01 to cx-05 (complex multi-concept), neg-01 to neg-05 (negative — topics NOT present, use expectedFiles: []), edge-01 to edge-05 (edge case). All expectedFiles must be from the provided file list."

**Also update `packages/benchmark/src/index.ts`:** Add export for `generateCorpus` and `CorpusGeneratorOptions`.
</action>
<verify>
<automated>cd /Users/rafael.goncalves/ia-framework && pnpm --filter @ia-framework/benchmark exec tsc --noEmit 2>&1 | head -30</automated>
</verify>
<done> - `packages/benchmark/src/corpus-generator.ts` compiles without TypeScript errors - `generateCorpus` and `CorpusGeneratorOptions` are exported from `packages/benchmark/src/index.ts` - TypeScript strict mode passes for the new file
</done>
</task>

<task type="auto">
  <name>Task 2: Add init-corpus subcommand to benchmark CLI</name>
  <files>packages/cli/src/commands/benchmark.command.ts</files>
  <action>
Add `initCorpusSubcommand()` function in `packages/cli/src/commands/benchmark.command.ts`, following the exact same pattern as the other subcommands (named helper function, then registered via `benchmark.addCommand()`).

**Import additions at top of file:**

```typescript
import { generateCorpus } from '@ia-framework/benchmark';
import type { CorpusGeneratorOptions } from '@ia-framework/benchmark';
import { copyFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
```

**Function signature:**

```typescript
function initCorpusSubcommand(): Command {
  return new Command('init-corpus')
    .description('Generate a 30-query benchmark corpus tailored to your project using an LLM')
    .option('-c, --config <path>', 'Path to project.json config')
    .option('--corpus <path>', 'Output path for benchmark-queries.json')
    .option('--model <model>', 'Completion model to use (default: gpt-4o-mini for OpenAI, llama3.2 for Ollama)')
    .option('--force', 'Overwrite existing corpus without backup prompt')
    .action(async (options: { config?: string; corpus?: string; model?: string; force?: boolean }) => { ... })
}
```

**Action implementation:**

1. Load config using `getConfigPath(options)` → `loadConfig(configPath)` (same as other subcommands)
2. Determine `corpusPath = options.corpus ?? join(frameworkDir, 'benchmark-queries.json')`
3. **Backup logic:** If corpus file already exists (use `existsSync`), create backup at `{corpusPath}.bak` using `copyFile` then log `✓ Backed up existing corpus to {corpusPath}.bak`
4. Determine completion model: `options.model ?? (config.embedding.provider === 'ollama' ? 'llama3.2' : 'gpt-4o-mini')`
5. Determine completion base URL: same as `config.embedding.baseUrl ?? 'https://api.openai.com'` (Ollama uses same baseUrl)
6. Log: `Generating 30-query corpus for ${config.targetProjectPath}...`
7. Log: `Using completion model: ${completionModel} via ${completionBaseUrl}`
8. Call `generateCorpus({ targetProjectPath: config.targetProjectPath, completionBaseUrl, completionApiKey: config.embedding.apiKey ?? '', completionModel })`
9. Write result as flat JSON array (pretty-printed, 2 spaces) to `corpusPath` using `writeFile` from `node:fs/promises`
10. Run `validateCorpus(queries, config.targetProjectPath)` — log any warnings but don't fail (generation may produce minor issues; user can fix)
11. Print summary:

    ```
    ✓ Generated 30-query corpus → {corpusPath}

    Categories:
      semantic:    5 queries
      keyword:     5 queries
      cross-file:  5 queries
      complex:     5 queries
      negative:    5 queries
      edge-case:   5 queries

    Run: ia-framework benchmark run
    ```

12. Error handling: wrap in try/catch, `process.stderr.write` + `process.exit(1)` on failure (same pattern as other subcommands)

**Register in `benchmarkCommand()`:**

```typescript
benchmark.addCommand(initCorpusSubcommand());
```

Add this line after the existing `benchmark.addCommand(compareSubcommand());` line.
</action>
<verify>
<automated>cd /Users/rafael.goncalves/ia-framework && pnpm --filter @ia-framework/cli exec tsc --noEmit 2>&1 | head -30 && node packages/cli/dist/bin.js benchmark --help 2>&1 | grep -c "init-corpus" || echo "0 (build required)"</automated>
</verify>
<done> - `packages/cli/src/commands/benchmark.command.ts` compiles without TypeScript errors - `ia-framework benchmark --help` lists `init-corpus` as a subcommand - `ia-framework benchmark init-corpus --help` shows `--model`, `--corpus`, `--force`, `--config` options - Running the command against a configured project produces a 30-query JSON file at `.ia-framework/benchmark-queries.json`
</done>
</task>

</tasks>

<verification>
After both tasks complete, run end-to-end compilation check:

```bash
cd /Users/rafael.goncalves/ia-framework && pnpm build 2>&1 | tail -20
```

Then verify CLI help shows new subcommand:

```bash
node packages/cli/dist/bin.js benchmark --help
node packages/cli/dist/bin.js benchmark init-corpus --help
```

</verification>

<success_criteria>

- `pnpm build` succeeds with no TypeScript errors
- `ia-framework benchmark init-corpus --help` shows correct options
- `ia-framework benchmark init-corpus` against a configured project generates `.ia-framework/benchmark-queries.json` with 30 queries in 6 categories
- Existing corpus is backed up to `.bak` before overwrite
- Generated corpus passes `validateCorpus()` (files referenced by non-negative queries exist on disk)
  </success_criteria>

<output>
No SUMMARY.md needed — this is a quick task. Update STATE.md Quick Tasks table with this entry after completion:

| 260407-fzq | Create CLI command to generate starter benchmark corpus | 2026-04-07 | {commit} | Complete | [260407-fzq-create-cli-command-to-generate-starter-b](./quick/260407-fzq-create-cli-command-to-generate-starter-b/) |
</output>
