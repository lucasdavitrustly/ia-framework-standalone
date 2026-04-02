# Quick Task: Ollama Embedding Model Selection - Research

**Researched:** 2026-04-02
**Domain:** Ollama API + Qdrant model/collection management
**Confidence:** HIGH

## Summary

This task adds the ability to select and switch between Ollama embedding models at install time and index time. The existing codebase is well-structured for this — `EmbeddingProviderConfig` already carries `provider` + `model` + optional `dimensions`, and `persistProfile()` already accepts `embeddingProvider`/`embeddingModel` options that are currently unused. The main work is: (1) wiring model selection into `install-ollama.sh` and `init-config.sh`, (2) adding `--model` flag to the `index` CLI command with auto-pull and dimension discovery, and (3) detecting dimension mismatches between configured model and existing Qdrant collection to trigger re-indexing.

**Primary recommendation:** Use Ollama's REST API (`/api/tags`, `/api/show`, `/api/pull`, `/api/embed`) directly via `fetch()` — the codebase already does this in `OllamaEmbeddingProvider`. No new dependencies needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Model selection at index time: Use model from project.json as default; `--model <name>` flag overrides; auto-pull if not installed; prompt interactively if no model configured; clear error messages on failure
- Install-time model discovery: `ollama list` to detect pulled models; show as selection menu; allow custom model name entry; auto-pull custom models; save to project.json
- Re-indexing on model change: detect dimension mismatch with existing collection; warn user; confirm before deleting collection and re-indexing; abort without changes if declined

### Specific Implementation Notes
- `persistProfile()` already has `embeddingProvider`/`embeddingModel` params — wire them up
- `DEFAULT_DIMENSIONS` map already covers nomic-embed-text, mxbai-embed-large, all-minilm
- For unknown models, query Ollama's model info endpoint or require user to specify dimensions
- Use existing CLI output patterns, not raw console.log
</user_constraints>

## Ollama REST API Findings

### Key Endpoints (Confidence: HIGH — verified via Context7 official docs)

| Endpoint | Method | Purpose | Key Response Fields |
|----------|--------|---------|-------------------|
| `/api/tags` | GET | List locally available models | `models[].name`, `models[].details.family`, `models[].details.parameter_size` |
| `/api/show` | POST | Get model details + capabilities | `capabilities[]`, `model_info.{arch}.embedding_length`, `details` |
| `/api/pull` | POST | Download model from registry | `status: "success"`, supports `stream: boolean` |
| `/api/embed` | POST | Generate embeddings | `embeddings[][]`, `model` |

### Discovering Embedding Dimensions at Runtime

**Strategy (in priority order):**

1. **Check `DEFAULT_DIMENSIONS` map** — instant, no API call. Already covers `nomic-embed-text` (768), `mxbai-embed-large` (1024), `all-minilm` (384).

2. **Call `POST /api/show`** and parse `model_info` for `*.embedding_length`:
   ```typescript
   // Source: Ollama API docs — /api/show response
   const res = await fetch(`${baseUrl}/api/show`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ model: modelName }),
   });
   const info = await res.json();
   // model_info keys are prefixed with architecture name
   // e.g., "gemma3.embedding_length": 2560, "nomic-bert.embedding_length": 768
   const embeddingLength = Object.entries(info.model_info ?? {})
     .find(([key]) => key.endsWith('.embedding_length'));
   if (embeddingLength) return embeddingLength[1] as number;
   ```

3. **Probe via `/api/embed`** — fallback, always works. Embed a short test string and check vector length:
   ```typescript
   const res = await fetch(`${baseUrl}/api/embed`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ model: modelName, input: 'test' }),
   });
   const result = await res.json();
   return result.embeddings[0].length; // actual dimensions
   ```

**Important:** Any Ollama model can technically produce embeddings via `/api/embed`. Dedicated embedding models (nomic-embed-text, mxbai-embed-large) are optimized for this. The `/api/show` `capabilities` array may list `"embedding"` for dedicated models, but chat models will also work — just with lower quality.

### Detecting Embedding Support from Model List

The `GET /api/tags` response does NOT include `capabilities`. To check if a model is an embedding model, you must call `/api/show` per model and check the `capabilities` array. **Recommendation:** Don't filter — show all locally available models and let the user choose. Known embedding models can be marked with a hint.

### Pulling Models Programmatically

```typescript
// POST /api/pull — non-streaming
const res = await fetch(`${baseUrl}/api/pull`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: modelName, stream: false }),
});
if (!res.ok) throw new Error(`Failed to pull model: ${res.status}`);
// Response: { "status": "success" }
```

**With streaming** (for progress display in CLI):
```typescript
const res = await fetch(`${baseUrl}/api/pull`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: modelName, stream: true }),
});
// Stream of NDJSON lines: { "status": "pulling manifest" }, { "status": "downloading ...", "completed": N, "total": M }, etc.
```

## Codebase Integration Points

### Files That Need Changes

| File | Change | Reason |
|------|--------|--------|
| `scripts/install-ollama.sh` | Add model selection menu after Ollama install/verify | User picks embedding model during install |
| `scripts/init-config.sh` | Accept model + dimensions from install-ollama.sh, write to project.json | Selected model must persist to config |
| `packages/cli/src/commands/index.command.ts` | Add `--model` option, dimension mismatch check, re-index confirmation | Model override at index time |
| `packages/embedding/src/factory.ts` | Add `discoverDimensions(model, baseUrl)` utility function | Runtime dimension discovery for unknown models |
| `packages/vector-store/src/qdrant.ts` | Add `deleteCollection()` method | Required for re-index on model change |
| `packages/vector-store/src/interface.ts` | Add `deleteCollection()` to `VectorStore` interface | Interface contract update |
| `packages/indexer/src/incremental.ts` | Store `embeddingModel` in `IndexingState` | Detect model mismatch vs last index |

### Current Codebase State (What Already Works)

- `EmbeddingProviderConfig` in `core/types` already has `provider`, `model`, `baseUrl`, `apiKey`, `dimensions` fields
- `EmbeddingProviderConfigSchema` in Zod validates all of these
- `persistProfile()` accepts `embeddingProvider` and `embeddingModel` options — **currently unused**
- `OllamaEmbeddingProvider` uses native `fetch()` against `/api/embed` — same pattern for other endpoints
- `QdrantVectorStore.initialize()` creates collection if not exists but **silently skips if exists** — does NOT verify dimensions match
- `QdrantVectorStore.getCollectionInfo()` already returns `vectorDimensions: { text, code }` — perfect for mismatch detection
- `DEFAULT_DIMENSIONS` covers 3 Ollama models + 3 OpenAI models
- `QdrantClient` (from `@qdrant/js-client-rest`) exposes `client.deleteCollection(name)` natively

### Model Mismatch Detection Logic

```typescript
// In index command, before running pipeline:
const collectionInfo = await vectorStore.getCollectionInfo();
const configuredDimensions = embeddingProvider.dimensions;

if (collectionInfo.pointCount > 0) {
  const existingDimensions = collectionInfo.vectorDimensions.text;
  if (existingDimensions !== configuredDimensions) {
    // Dimension mismatch — warn and prompt
    console.warn(`⚠ Current collection uses ${existingDimensions}d vectors (model mismatch)`);
    console.warn(`  New model "${config.embedding.model}" produces ${configuredDimensions}d vectors`);
    // Prompt: re-index or abort
  }
}
```

**Note:** Even if dimensions match, a model change means vectors are semantically incompatible. Best approach: also store the model name in `indexing-state.json` and compare.

## Architecture Patterns

### Dimension Discovery Flow
```
User provides model name
  → Check DEFAULT_DIMENSIONS map (no API call)
  → If unknown: POST /api/show → parse model_info.*.embedding_length
  → If still unknown: POST /api/embed with test input → measure vector length
  → If all fail: ask user for dimensions or error out
```

### Install-Time Selection Flow (Bash)
```
1. Check if Ollama is running (ollama list succeeds)
2. Parse `ollama list` output or `GET /api/tags` for model names
3. Display numbered menu with known models highlighted
4. Accept selection or custom model name input
5. If custom model not local → ollama pull
6. Discover dimensions
7. Pass model + dimensions to init_config / project.json writer
```

### Index-Time Override Flow (TypeScript)
```
1. Load config from project.json (existing flow)
2. If --model flag provided:
   a. Check if model is locally available (GET /api/tags)
   b. If not → auto-pull (POST /api/pull with progress)
   c. Discover dimensions for this model
   d. Override config.embedding.model and config.embedding.dimensions
3. Check collection dimensions vs provider dimensions
4. Also check indexing-state.json for lastEmbeddingModel
5. If mismatch: warn, prompt for confirmation
6. If confirmed: deleteCollection() → proceed with fresh index
7. Run pipeline (existing flow)
8. Save model name to indexing-state.json
```

## Common Pitfalls

### Pitfall 1: Silent Dimension Mismatch
**What goes wrong:** `QdrantVectorStore.initialize()` currently does `if (existence.exists) return;` — if a collection exists with 768d vectors and you switch to a 1024d model, upsert will fail with a Qdrant error about vector size mismatch.
**How to avoid:** Check dimensions BEFORE calling `pipeline.run()`. The `getCollectionInfo()` method already returns dimensions.

### Pitfall 2: Ollama Model Names Have Tags
**What goes wrong:** Ollama models are `name:tag` format (e.g., `nomic-embed-text:latest`). The `ollama list` command shows the full name, but `DEFAULT_DIMENSIONS` uses short names.
**How to avoid:** Strip `:latest` suffix when comparing against `DEFAULT_DIMENSIONS`. The Ollama API accepts both `nomic-embed-text` and `nomic-embed-text:latest`.

### Pitfall 3: Model Pull Can Be Slow/Fail
**What goes wrong:** Pulling a model during `index` command blocks for potentially minutes with no feedback. Network failures leave no model available.
**How to avoid:** Use streaming pull with progress display. Verify model exists via `/api/tags` after pull before proceeding.

### Pitfall 4: Incremental Indexing After Model Change
**What goes wrong:** If user changes model but doesn't force re-index, incremental mode will only index new/changed files — mixing old vectors (wrong model) with new vectors (new model).
**How to avoid:** When model mismatch detected, force full re-index (delete collection first). Clear `indexing-state.json` to reset incremental state.

### Pitfall 5: /api/show May Fail for Undownloaded Models
**What goes wrong:** `/api/show` only works for locally available models. If user types a custom model name that isn't pulled yet, dimension discovery via `/api/show` will fail.
**How to avoid:** Pull the model first, THEN discover dimensions. Or use `DEFAULT_DIMENSIONS` map for known models before pulling.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Qdrant collection deletion | Custom HTTP calls | `this.client.deleteCollection(name)` | Already in `@qdrant/js-client-rest` |
| Model progress display | Custom streaming parser | Streaming NDJSON from `/api/pull` with `stream: true` | Ollama's native streaming format |
| Interactive CLI prompts in TS | Raw `process.stdin` | `readline` from `node:readline/promises` (Node.js built-in) | Built-in, handles edge cases (ctrl-C, etc.) |

## Code Examples

### Bash: Model Selection Menu (for install-ollama.sh)
```bash
# Get list of locally available models
local models=()
while IFS= read -r line; do
  models+=("$line")
done < <(ollama list 2>/dev/null | tail -n +2 | awk '{print $1}')

if [ ${#models[@]} -eq 0 ]; then
  echo "  No models found. Enter a model name to pull:"
  read -r selected_model
else
  echo "  Available models:"
  for i in "${!models[@]}"; do
    echo "    $((i+1)). ${models[$i]}"
  done
  echo "    $((${#models[@]}+1)). Enter a custom model name"
  printf "  Select [1]: "
  read -r choice
  # ... parse choice, default to 1
fi
```

### TypeScript: Dimension Discovery
```typescript
// packages/embedding/src/factory.ts — new export
export async function discoverDimensions(
  model: string,
  baseUrl = 'http://localhost:11434',
): Promise<number> {
  // 1. Check known models
  const known = DEFAULT_DIMENSIONS[model] ?? DEFAULT_DIMENSIONS[model.replace(/:latest$/, '')];
  if (known) return known;

  // 2. Try /api/show
  try {
    const res = await fetch(`${baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    if (res.ok) {
      const info = await res.json() as { model_info?: Record<string, unknown> };
      const entry = Object.entries(info.model_info ?? {})
        .find(([key]) => key.endsWith('.embedding_length'));
      if (entry && typeof entry[1] === 'number') return entry[1];
    }
  } catch { /* continue to fallback */ }

  // 3. Probe via /api/embed
  const embedRes = await fetch(`${baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: 'dimension probe' }),
  });
  if (!embedRes.ok) {
    throw new Error(`Cannot determine dimensions for model "${model}". Specify dimensions in project.json.`);
  }
  const embedResult = await embedRes.json() as { embeddings: number[][] };
  const vec = embedResult.embeddings[0];
  if (!vec || vec.length === 0) {
    throw new Error(`Model "${model}" returned empty embedding vector.`);
  }
  return vec.length;
}
```

### TypeScript: Collection Deletion (add to QdrantVectorStore)
```typescript
async deleteCollection(): Promise<void> {
  await this.client.deleteCollection(this.collectionName);
}
```

## Open Questions

1. **Should we store the model name in Qdrant collection metadata or just in indexing-state.json?**
   - What we know: Qdrant doesn't have a native "collection metadata" field beyond vector config. Could use a sentinel point or rely on local state file.
   - Recommendation: Store in `indexing-state.json` — simpler, already used for incremental state. Add `embeddingModel: string` field to `IndexingState`.

2. **Should the install-time menu filter to embedding-only models or show all?**
   - What we know: `/api/tags` doesn't include capabilities. Would need `/api/show` per model to filter (slow if many models).
   - Recommendation: Show all models, highlight known embedding models with a marker (e.g., `[embed]`). Don't filter — user may want to experiment.

## Sources

### Primary (HIGH confidence)
- Context7 `/llmstxt/ollama_llms_txt` — API endpoints for /api/tags, /api/show, /api/pull, /api/embed
- Context7 `/qdrant/qdrant` — Collection deletion, collection info, creation API
- Codebase inspection — all integration points verified by reading actual source files

### Secondary (MEDIUM confidence)
- `/api/show` `capabilities` field format for embedding models — documented but not tested against an actual embedding model in this research
- `model_info.{arch}.embedding_length` key pattern — verified from docs example (gemma3) but naming convention may vary per architecture
