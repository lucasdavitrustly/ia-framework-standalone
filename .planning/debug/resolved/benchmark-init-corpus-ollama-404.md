---
status: awaiting_human_verify
trigger: "benchmark init-corpus fails with Completion API error 404 — model 'llama3.2' not found"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T00:45:00Z
---

## Current Focus

<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED AND FIXED
test: All 53 CLI tests pass; TypeScript compiles clean; 0 new lint errors introduced
expecting: Human verification that init-corpus no longer 404s (or falls back gracefully)
next_action: await human verification

## Symptoms

<!-- Written during gathering, then IMMUTABLE -->

expected: `ia-framework benchmark init-corpus` generates a 30-query benchmark corpus using local Ollama
actual: Command fails immediately with: ✗ benchmark init-corpus failed: Error: Completion API error 404: {"error":{"message":"model 'llama3.2' not found","type":"not_found_error","param":null,"code":null}}
errors: Completion API error 404 — model 'llama3.2' not found (not_found_error)
reproduction: Run `ia-framework benchmark init-corpus` with Ollama running but llama3.2 not pulled
started: Likely always been this way — the default model is hardcoded to llama3.2 but that model may not be installed

## Eliminated

<!-- APPEND only - prevents re-investigating -->

## Evidence

<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-07T00:05:00Z
  checked: ollama list / curl http://localhost:11434/api/tags
  found: Only model installed is `qwen3-embedding:0.6b`. No llama3.2, no chat/completion model installed.
  implication: The default model llama3.2 does not exist locally; any call to Ollama's chat/completions endpoint with llama3.2 will 404.

- timestamp: 2026-04-07T00:05:00Z
  checked: packages/cli/src/commands/benchmark.command.ts lines 528-621
  found: OLLAMA_DEFAULT_MODEL = 'llama3.2' (line 529). When --model is NOT specified, the code probes /api/tags to confirm Ollama is reachable (line 600) but does NOT verify the model exists. Proceeds with hardcoded model name (line 592: completionModel = OLLAMA_DEFAULT_MODEL).
  implication: The root cause — Ollama reachability check is insufficient. It should also check if the model is pulled, or dynamically pick an available model.

- timestamp: 2026-04-07T00:05:00Z
  checked: packages/benchmark/src/corpus-generator.ts
  found: corpus-generator.ts is purely a function — receives completionModel as a parameter. The hardcoding is entirely in the CLI command (benchmark.command.ts). No fix needed in corpus-generator.ts itself.
  implication: The fix is localized to benchmark.command.ts:initCorpusSubcommand()

- timestamp: 2026-04-07T00:05:00Z
  checked: Ollama /api/tags response structure
  found: Returns { models: [{ name: "qwen3-embedding:0.6b", ...details.family: "qwen3", details.families: [...] }] }
  implication: We can inspect the available models and filter for chat-capable ones (not embedding-only models). Embedding models identified by "embed" in the name. Chat models: llama, mistral, qwen (non-embed), phi, gemma, etc.

- timestamp: 2026-04-07T00:30:00Z
  checked: packages/cli/src/commands/benchmark.command.ts after fix
  found: New functions isEmbeddingModel() and selectChatModel() added. initCorpusSubcommand() now parses /api/tags response, selects preferred model if installed, falls back to first chat model, or exits with actionable error if only embedding models installed.
  implication: Fix verified — 53/53 tests pass, 0 new lint errors, TypeScript compiles cleanly.

## Resolution

<!-- OVERWRITE as understanding evolves -->

root_cause: OLLAMA_DEFAULT_MODEL = 'llama3.2' was hardcoded in benchmark.command.ts. The /api/tags probe only checked Ollama reachability but not whether the specific model was installed. This caused the subsequent chat/completions call to fail with HTTP 404 when llama3.2 was not pulled.
fix: Added isEmbeddingModel() and selectChatModel() helper functions. The /api/tags probe now parses the response and: (1) uses llama3.2 if installed, (2) falls back to the first non-embedding model with a console notice, (3) exits with actionable error message if no chat-capable models are installed. Both helpers are exported for testability.
verification: 53/53 tests pass; TypeScript compiles with --noEmit; 0 new lint errors
files_changed: [packages/cli/src/commands/benchmark.command.ts, packages/cli/src/commands/benchmark.command.test.ts]
