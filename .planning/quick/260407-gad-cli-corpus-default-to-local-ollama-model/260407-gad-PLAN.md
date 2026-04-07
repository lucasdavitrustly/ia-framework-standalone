---
quick_task: 260407-gad
title: CLI corpus — default to local Ollama, guard target project path
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/cli/src/commands/benchmark.command.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - 'Running `ia-framework benchmark init-corpus` without --model defaults to Ollama (nomic-embed-text) regardless of the embedding config'
    - "If Ollama is unavailable at localhost:11434, the CLI prints an actionable error: 'Ollama not reachable. Install and start Ollama, then run: ollama pull nomic-embed-text'"
    - 'If targetProjectPath in project.json is the ia-framework repo itself (i.e. points at ia-framework), the command exits with a clear error'
  artifacts:
    - path: packages/cli/src/commands/benchmark.command.ts
      provides: Updated initCorpusSubcommand with Ollama default, availability check, and target-project guard
  key_links:
    - from: initCorpusSubcommand
      to: Ollama /api/tags endpoint
      via: fetch HEAD check before calling generateCorpus
      pattern: 'fetch.*11434/api/tags'
    - from: initCorpusSubcommand
      to: config.targetProjectPath
      via: path comparison guard against process.cwd()
      pattern: 'targetProjectPath.*ia-framework'
---

<objective>
Harden the `ia-framework benchmark init-corpus` CLI command with two safety behaviors:

1. **Default to local Ollama** — When `--model` is not provided, always default to Ollama (`nomic-embed-text`) with `http://localhost:11434` as the base URL, regardless of the configured embedding provider. Before calling `generateCorpus()`, probe Ollama's `/api/tags` endpoint to confirm it is reachable. If unreachable, exit with a clear message instructing the user to install/start Ollama and pull the model.

2. **Enforce target project guard** — Validate that `config.targetProjectPath` is NOT the ia-framework directory itself. If it resolves to the same path as the framework root (heuristic: contains `packages/` and `apps/` sub-directories typical of this monorepo, OR is a parent/equal to the path returned by finding `ia-framework` in the path), exit with an error explaining that corpus generation must target the developer's own project.

Purpose: Prevent accidental corpus generation against the wrong project or with a cloud model when Ollama is the correct default for local-first usage.

Output: Modified `packages/cli/src/commands/benchmark.command.ts`
</objective>

<execution_context>
@~/.config/opencode/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@packages/cli/src/commands/benchmark.command.ts
@packages/benchmark/src/corpus-generator.ts

<interfaces>
<!-- Relevant types and contracts from current codebase -->

From packages/benchmark/src/corpus-generator.ts:

```typescript
export interface CorpusGeneratorOptions {
  targetProjectPath: string;
  completionBaseUrl: string; // e.g. "http://localhost:11434"
  completionApiKey: string; // empty string for Ollama
  completionModel: string; // e.g. "nomic-embed-text" or "llama3.2"
}
export async function generateCorpus(options: CorpusGeneratorOptions): Promise<BenchmarkQuery[]>;
```

From packages/core/src/config/schema.ts (inferred):

```typescript
interface ProjectConfig {
  embedding: {
    provider: 'openai' | 'ollama';
    model: string;
    baseUrl?: string;
    apiKey?: string;
  };
  targetProjectPath: string; // absolute path to the target project
  vectorStore: { host: string; port: number; collectionName: string; apiKey?: string };
}
```

From packages/embedding/src/providers/ollama.ts:

- Default Ollama baseUrl: `http://localhost:11434`
- Embedding endpoint: `POST /api/embed`
- Availability probe: `GET /api/tags` (lists installed models — returns 200 if Ollama is running)

Recommended embedding model for corpus generation (LLM completions, NOT embeddings):

- Ollama default completion model for corpus: `llama3.2` (as was prior behavior)
- BUT the task description says: default to `nomic-embed-text` — re-read task context.

NOTE: The task is about the **completion** model used to generate the corpus (calls `/v1/chat/completions`), not the embedding model. The current code already defaults to `llama3.2` for Ollama. The task says "default to local Ollama model" and "suggest download if unavailable."

Key re-interpretation:

- Default completion provider: Ollama (base URL `http://localhost:11434`)
- Default completion model: `llama3.2` (already done), but we want `nomic-embed-text` for embed — wait, `nomic-embed-text` is an embedding model, not a chat model. For chat/completion, the correct Ollama default is `llama3.2`.
- The "suggest download" behavior: if Ollama is unreachable OR the model isn't available, suggest `ollama pull llama3.2`.
- The task description says "suggest a specific model to download (e.g., ollama pull nomic-embed-text)" — this was an example; the actual completion model is `llama3.2`.

FINAL INTERPRETATION:

1. Default to Ollama for corpus generation (base URL `http://localhost:11434`, model `llama3.2`)
2. Probe `/api/tags` before calling LLM — if unreachable, print: "Ollama not reachable at http://localhost:11434. To use local model generation, install Ollama and run: ollama pull llama3.2"
3. Guard: if `config.targetProjectPath` appears to be the ia-framework repo (detect by checking if the path contains both a `packages/` dir and an `apps/` dir AND a `turbo.json` file — the framework's own monorepo signature), exit with error.
   </interfaces>
   </context>

<tasks>

<task type="auto">
  <name>Task 1: Default corpus to Ollama with availability probe and target-project guard</name>
  <files>packages/cli/src/commands/benchmark.command.ts</files>
  <action>
Modify `initCorpusSubcommand()` in `packages/cli/src/commands/benchmark.command.ts`:

**Change 1 — Default to Ollama (always, not based on config.embedding.provider):**

Current logic (line ~535):

```typescript
const completionModel =
  options.model ?? (config.embedding.provider === 'ollama' ? 'llama3.2' : 'gpt-4o-mini');
const completionBaseUrl = config.embedding.baseUrl ?? 'https://api.openai.com';
const completionApiKey = config.embedding.apiKey ?? '';
```

New logic: When `--model` is NOT provided, ALWAYS default to Ollama regardless of embedding config. Only fall back to configured provider when `--model` is explicitly passed (in which case the user knows what they're doing).

```typescript
const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';
const OLLAMA_DEFAULT_MODEL = 'llama3.2';

// Determine if user explicitly passed --model
const modelExplicit = options.model !== undefined;

let completionModel: string;
let completionBaseUrl: string;
let completionApiKey: string;

if (modelExplicit) {
  // User explicitly specified a model — use configured provider settings
  completionModel = options.model!;
  completionBaseUrl =
    config.embedding.baseUrl ??
    (config.embedding.provider === 'ollama' ? OLLAMA_DEFAULT_BASE_URL : 'https://api.openai.com');
  completionApiKey = config.embedding.apiKey ?? '';
} else {
  // Default: always use local Ollama for corpus generation
  completionModel = OLLAMA_DEFAULT_MODEL;
  completionBaseUrl = OLLAMA_DEFAULT_BASE_URL;
  completionApiKey = '';
}
```

**Change 2 — Probe Ollama availability (only when using Ollama default):**

After determining completionBaseUrl/model, add an availability check when using Ollama:

```typescript
// When using Ollama (default or explicitly configured), probe availability first
const isUsingOllama =
  completionBaseUrl.includes('localhost:11434') ||
  completionBaseUrl.includes('127.0.0.1:11434') ||
  !modelExplicit;
if (!modelExplicit) {
  // Probe Ollama /api/tags — returns 200 if running, fails if not
  try {
    const probeRes = await fetch(`${completionBaseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    if (!probeRes.ok) {
      throw new Error(`HTTP ${probeRes.status}`);
    }
  } catch {
    process.stderr.write(
      `✗ Ollama not reachable at ${completionBaseUrl}\n` +
        `  To generate corpus with a local model:\n` +
        `  1. Install Ollama: https://ollama.com\n` +
        `  2. Pull the model: ollama pull ${completionModel}\n` +
        `  3. Re-run: ia-framework benchmark init-corpus\n` +
        `\n` +
        `  To use a cloud model instead, pass --model explicitly:\n` +
        `  ia-framework benchmark init-corpus --model gpt-4o-mini\n`,
    );
    process.exit(1);
    return;
  }
}
```

**Change 3 — Target project guard:**

Add a helper function `isFrameworkRepo(targetPath: string): Promise<boolean>` that checks for the ia-framework monorepo signature:

```typescript
import { stat } from 'node:fs/promises';

async function isFrameworkRepo(targetPath: string): Promise<boolean> {
  // Heuristic: ia-framework monorepo has packages/, apps/, and turbo.json at the root
  const markers = ['packages', 'apps', 'turbo.json'];
  try {
    const checks = await Promise.all(
      markers.map((m) =>
        stat(join(targetPath, m))
          .then(() => true)
          .catch(() => false),
      ),
    );
    return checks.every(Boolean);
  } catch {
    return false;
  }
}
```

Call this guard after loading config, BEFORE any corpus generation:

```typescript
// Guard: ensure target project is NOT the ia-framework repo itself
if (await isFrameworkRepo(config.targetProjectPath)) {
  process.stderr.write(
    `✗ targetProjectPath appears to be the ia-framework repo itself:\n` +
      `  ${config.targetProjectPath}\n\n` +
      `  Corpus generation must target YOUR project, not the ia-framework tool.\n` +
      `  Update 'targetProjectPath' in ${configPath} to point at your project.\n`,
  );
  process.exit(1);
  return;
}
```

Place this check RIGHT AFTER `const config = await loadConfig(configPath);` and BEFORE the backup logic.

Also update the console.log that shows model info to clarify when using default:

```typescript
const modelSource = modelExplicit ? '(explicit --model)' : '(default local)';
console.log(`Using completion model: ${completionModel} via ${completionBaseUrl} ${modelSource}`);
```

**Import additions needed:**

- `import { stat } from 'node:fs/promises';` — add to existing `node:fs/promises` import (merge with `writeFile, copyFile`)

**TypeScript:** Run `pnpm --filter @ia-framework/benchmark build && pnpm --filter @ia-framework/cli exec tsc --noEmit` to verify clean compile.
</action>
<verify>
<automated>pnpm --filter @ia-framework/cli exec tsc --noEmit</automated>
</verify>
<done> - TypeScript compiles without errors - `ia-framework benchmark init-corpus --help` still shows correct options - Code defaults to `http://localhost:11434` + `llama3.2` when `--model` is not passed - Ollama probe attempt is made before calling generateCorpus when using Ollama default - isFrameworkRepo guard is in place before any corpus work
</done>
</task>

<task type="checkpoint:human-verify">
  <what-built>
    Ollama default + availability probe + target-project guard in `ia-framework benchmark init-corpus`.
  </what-built>
  <how-to-verify>
    1. **Guard test** — run against ia-framework itself (if project.json points here):
       ```
       ia-framework benchmark init-corpus --config .ia-framework/project.json
       ```
       Expected: exits with `✗ targetProjectPath appears to be the ia-framework repo itself` error.

    2. **Ollama unavailable test** — stop Ollama (or ensure it's not running), then run init-corpus against a real target project. Expected: exits with "Ollama not reachable" message with instructions to install and `ollama pull llama3.2`.

    3. **Explicit model bypass test** — pass `--model gpt-4o-mini` explicitly. Expected: does NOT probe Ollama, proceeds with OpenAI URL from config.

    4. **`--help` output** — verify the description still reads correctly and all 4 options are shown.

  </how-to-verify>
  <resume-signal>Type "approved" or describe any issues found</resume-signal>
</task>

</tasks>

<verification>
- TypeScript compiles cleanly after changes
- `ia-framework benchmark init-corpus --help` shows the command correctly
- When default path (no --model): uses `http://localhost:11434` + `llama3.2`
- When Ollama not reachable: error message includes actionable `ollama pull llama3.2` instruction
- When targetProjectPath is ia-framework repo: early exit with clear error message
- When `--model` explicitly provided: skips Ollama probe, uses configured provider
</verification>

<success_criteria>

1. No `--model` flag → always uses Ollama (`llama3.2`, `localhost:11434`)
2. Ollama not running → clear error with `ollama pull llama3.2` instruction, exits 1
3. Target project = ia-framework repo → guard fires, exits 1 with clear message
4. `--model gpt-4o-mini` passed → existing cloud behavior unchanged, no Ollama probe
5. TypeScript compiles without errors
   </success_criteria>

<output>
After completion, create `.planning/quick/260407-gad-cli-corpus-default-to-local-ollama-model/260407-gad-SUMMARY.md` following the quick task summary format.
</output>
