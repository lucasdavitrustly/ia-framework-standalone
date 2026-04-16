---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/project-detector/src/persister.ts
  - packages/project-detector/src/persister.test.ts
  - packages/cli/src/commands/init.command.ts
  - packages/dashboard-api/src/routes/config.ts
  - apps/dashboard/src/api/client.ts
  - apps/dashboard/src/pages/Config.tsx
  - README.md
autonomous: true
requirements: []
must_haves:
  truths:
    - 'Running `ia-framework init --llm-model gemma3:4b` writes indexing.llm config to project.json'
    - 'Dashboard Config page displays the LLM chunking model and Ollama URL'
    - 'Dashboard Config page allows editing LLM chunking model and Ollama URL, persisting to project.json'
    - 'README documents the indexing.llm config block and --llm-model / --llm-url init flags'
  artifacts:
    - path: packages/project-detector/src/persister.ts
      provides: 'PersistOptions with llmModel/llmUrl, persistProfile writes indexing.llm block'
    - path: packages/cli/src/commands/init.command.ts
      provides: '--llm-model and --llm-url CLI flags'
    - path: packages/dashboard-api/src/routes/config.ts
      provides: 'PATCH /api/config endpoint for editing config'
    - path: apps/dashboard/src/pages/Config.tsx
      provides: 'LLM Chunking section with editable fields'
  key_links:
    - from: packages/cli/src/commands/init.command.ts
      to: packages/project-detector/src/persister.ts
      via: 'persistOptions.llmModel passed to persistProfile()'
      pattern: 'llmModel'
    - from: apps/dashboard/src/pages/Config.tsx
      to: packages/dashboard-api/src/routes/config.ts
      via: 'PATCH /api/config'
      pattern: 'PATCH.*config'
---

<objective>
Add LLM chunking model configuration to the init flow, dashboard settings, and documentation.

Purpose: Users need to configure which Ollama model is used for LLM-based semantic chunking (separate from embedding model) before their first `--strategy llm` indexing run, rather than relying on the hardcoded `llama3.2:latest` default.

Output: Init command writes `indexing.llm` config, dashboard displays and edits it, README documents it.
</objective>

<execution_context>
@~/.config/opencode/get-shit-done/workflows/execute-plan.md
@~/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/project-detector/src/persister.ts
@packages/project-detector/src/persister.test.ts
@packages/cli/src/commands/init.command.ts
@packages/core/src/config/schema.ts
@packages/dashboard-api/src/routes/config.ts
@packages/dashboard-api/src/config-watcher.ts
@apps/dashboard/src/api/client.ts
@apps/dashboard/src/pages/Config.tsx
@README.md

<interfaces>
<!-- Key types the executor needs -->

From packages/core/src/config/schema.ts:

```typescript
export const LlmConfigSchema = z.object({
  model: z.string().min(1),
  ollamaUrl: z.string().url().default('http://localhost:11434'),
});

export const IndexingConfigSchema = z.object({
  includePatterns: z.array(z.string()),
  excludePatterns: z.array(z.string()),
  maxChunkLines: z.number().int().positive().optional(),
  respectGitignore: z.boolean().optional(),
  embeddingConcurrency: z.number().int().positive().optional(),
  llm: LlmConfigSchema.optional(),
});
```

From packages/project-detector/src/persister.ts:

```typescript
export interface PersistOptions {
  targetProjectPath?: string | undefined;
  embeddingProvider?: 'openai' | 'ollama' | undefined;
  embeddingModel?: string | undefined;
  embeddingDimensions?: number | undefined;
}
```

From packages/dashboard-api/src/routes/config.ts:

```typescript
interface ConfigDeps {
  configWatcher: { getConfig(): ProjectConfig | null };
}
// Currently only has GET /
```

From apps/dashboard/src/api/client.ts:

```typescript
export interface ProjectConfig {
  targetProjectPath: string;
  embedding: { provider: string; model: string };
  vectorStore: { host: string; port: number; collectionName: string };
  indexing?: { includePatterns: string[]; excludePatterns: string[] };
  profile?: ProjectProfile;
}
```

</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add LLM config to init flow (persister + CLI)</name>
  <files>
    packages/project-detector/src/persister.ts,
    packages/project-detector/src/persister.test.ts,
    packages/cli/src/commands/init.command.ts
  </files>
  <behavior>
    - Test: persistProfile with llmModel option writes indexing.llm.model and indexing.llm.ollamaUrl to output JSON
    - Test: persistProfile with llmModel + llmUrl options writes custom ollamaUrl
    - Test: persistProfile without llmModel does NOT write indexing.llm block (backward compatible)
    - Test: persistProfile with existing indexing config merges llm into it (doesn't clobber includePatterns etc.)
  </behavior>
  <action>
    1. In `packages/project-detector/src/persister.ts`:
       - Add `llmModel?: string` and `llmUrl?: string` to `PersistOptions` interface
       - In `persistProfile()`, when building `merged`, if `options.llmModel` is set:
         - Ensure `merged.indexing` exists (create with sensible defaults if needed, or merge into existing)
         - Set `merged.indexing.llm = { model: options.llmModel, ollamaUrl: options.llmUrl ?? 'http://localhost:11434' }`
       - If existing config already has `indexing.llm` and no new llmModel option, preserve existing

    2. In `packages/cli/src/commands/init.command.ts`:
       - Add `.option('--llm-model <model>', 'Ollama model for LLM chunking (e.g. llama3.2:latest)')`
       - Add `.option('--llm-url <url>', 'Ollama URL for LLM chunking (default: http://localhost:11434)')`
       - Add `llmModel?: string` and `llmUrl?: string` to the options type
       - Pass `persistOptions.llmModel = options.llmModel` and `persistOptions.llmUrl = options.llmUrl` when set
       - Log the LLM model in the output: `console.log(\`  LLM chunking:    \${options.llmModel}\`)`

    3. Write tests in persister.test.ts following existing test patterns.

  </action>
  <verify>
    <automated>cd packages/project-detector && pnpm test -- --run</automated>
  </verify>
  <done>
    - `ia-framework init /path --llm-model gemma3:4b` writes `indexing.llm.model: "gemma3:4b"` to project.json
    - `ia-framework init /path` (no flag) does NOT write indexing.llm block
    - All existing persister tests still pass
  </done>
</task>

<task type="auto">
  <name>Task 2: Dashboard config display + edit for LLM chunking</name>
  <files>
    packages/dashboard-api/src/routes/config.ts,
    apps/dashboard/src/api/client.ts,
    apps/dashboard/src/pages/Config.tsx
  </files>
  <action>
    1. In `packages/dashboard-api/src/routes/config.ts`:
       - Expand `ConfigDeps` to include `configPath: string` (the path to project.json, needed for writing)
       - Add `PATCH /` handler that:
         - Accepts JSON body with partial config updates (specifically `indexing.llm.model` and `indexing.llm.ollamaUrl`)
         - Reads current project.json from disk, deep-merges the patch, writes it back
         - Uses `readFile`/`writeFile` from `node:fs/promises` (same pattern as persister.ts)
         - Returns the updated config
         - The ConfigWatcher will auto-detect the file change and reload

    2. In `apps/dashboard/src/api/client.ts`:
       - Update `ProjectConfig` interface: add `llm?: { model: string; ollamaUrl?: string }` inside the `indexing` type
       - Add `updateConfig: (patch: Partial<ProjectConfig>) => ...` method using PATCH /api/config

    3. In `apps/dashboard/src/pages/Config.tsx`:
       - Add a new "LLM Chunking" section (same card style as Embedding section) after the Embedding section
       - Show `indexing.llm.model` and `indexing.llm.ollamaUrl` as editable text inputs
       - If no LLM config exists yet, show a "Configure LLM Chunking" button that reveals empty fields
       - On save, call `DashboardClient.updateConfig({ indexing: { llm: { model, ollamaUrl } } })`
       - Show a simple success/error toast (inline text is fine, no toast library needed)

    Note: The PATCH endpoint and ConfigDeps change requires wiring `configPath` from the server setup. Check `packages/dashboard-api/src/app.ts` for how routes are mounted and pass the configPath through.

  </action>
  <verify>
    <automated>cd packages/dashboard-api && pnpm test -- --run</automated>
  </verify>
  <done>
    - Dashboard Config page shows LLM Chunking section with model and Ollama URL fields
    - Editing and saving writes to project.json on disk
    - ConfigWatcher picks up the change automatically
  </done>
</task>

<task type="auto">
  <name>Task 3: Document LLM chunking config in README</name>
  <files>README.md</files>
  <action>
    1. In the "Step 5: Create the Configuration" JSON example (~line 201), add the `indexing.llm` block:
       ```json
       "indexing": {
         ...existing fields...,
         "llm": {
           "model": "llama3.2:latest",
           "ollamaUrl": "http://localhost:11434"
         }
       }
       ```

    2. In the `ia-framework init` CLI section (~line 360), add the new flags:
       ```
       --llm-model <model>  Ollama model for LLM chunking (e.g. llama3.2:latest)
       --llm-url <url>      Ollama URL for LLM chunking (default: http://localhost:11434)
       ```

    3. In the Configuration reference section (~line 666), add `indexing.llm` to the JSON example:
       ```json
       "indexing": {
         ...existing...,
         "llm": {
           "model": "llama3.2:latest",
           "ollamaUrl": "http://localhost:11434"
         }
       }
       ```

    4. Add a brief note near the LLM strategy documentation (~line 109) mentioning that the chunking model can be pre-configured via `init --llm-model` or in project.json's `indexing.llm.model`.

  </action>
  <verify>
    <automated>grep -c "llm-model\|indexing.*llm\|ollamaUrl" README.md | xargs test 4 -le</automated>
  </verify>
  <done>
    - README shows indexing.llm config in both JSON examples
    - README documents --llm-model and --llm-url flags for init command
    - README mentions pre-configuring the chunking model
  </done>
</task>

</tasks>

<verification>
- `pnpm -r test -- --run` — all tests pass across packages
- `pnpm build` — full build succeeds
- Config page shows LLM Chunking section
</verification>

<success_criteria>

- Init command accepts --llm-model and writes indexing.llm to project.json
- Dashboard Config page displays and edits LLM chunking model/URL
- README documents all new options
- All existing tests pass, new persister tests pass
  </success_criteria>

<output>
After completion, create `.planning/quick/260416-fkg-add-llm-chunking-model-config-to-project/260416-fkg-SUMMARY.md`
</output>
