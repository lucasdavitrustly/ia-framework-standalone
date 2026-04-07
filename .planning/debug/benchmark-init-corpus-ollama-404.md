---
status: awaiting_human_verify
trigger: "benchmark init-corpus fails with Completion API error 404 — model 'llama3.2' not found"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T18:44:00Z
---

## Current Focus

<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — two root causes found and fixed: (1) hardcoded llama3.2 model with no existence check, (2) max_tokens=4096 too low for large Java corpora.
test: Both fixes applied. All 29 benchmark + 53 CLI tests pass. TypeScript compiles cleanly.
expecting: `ia-framework benchmark init-corpus` now completes successfully against local Ollama.
next_action: Await human verification that command completes end-to-end in real environment.

## Symptoms

<!-- Written during gathering, then IMMUTABLE -->

expected: `ia-framework benchmark init-corpus` generates a 30-query benchmark corpus using local Ollama
actual: Command fails immediately with: ✗ benchmark init-corpus failed: Error: Completion API error 404: {"error":{"message":"model 'llama3.2' not found","type":"not_found_error","param":null,"code":null}}
errors: Completion API error 404 — model 'llama3.2' not found (not_found_error)
reproduction: Run `ia-framework benchmark init-corpus` with Ollama running but llama3.2 not pulled
started: Likely always been this way — the default model is hardcoded to llama3.2 but that model may not be installed

## NEW SYMPTOM (post-fix)

actual: After model-selection fix, now fails with: Error: Failed to parse LLM response as JSON: SyntaxError: Unterminated string in JSON at position 16951 (line 388 column 64)
errors: JSON parse failure — truncated at position 16951 mid-string
reproduction: Run `ia-framework benchmark init-corpus` with llama3.2:latest, against Java project with long file paths

## Eliminated

<!-- APPEND only - prevents re-investigating -->

- hypothesis: llama3.2 model not installed (404 error)
  evidence: After fix #1, model selection works — llama3.2:latest found and used
  timestamp: 2026-04-07T00:45:00Z

- hypothesis: Ollama streaming/buffering cuts response
  evidence: The truncation is at exactly the max_tokens boundary (16951 chars / ~4 chars per token ≈ 4238 tokens, against max_tokens=4096). This is a hard token limit, not a network issue.
  timestamp: 2026-04-07T01:00:00Z

- hypothesis: Context window overflow
  evidence: llama3.2:latest has 131072 context window — the prompt easily fits. The issue is output token limit, not input.
  timestamp: 2026-04-07T01:00:00Z

## Evidence

<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-07T00:05:00Z
  checked: ollama list / curl http://localhost:11434/api/tags
  found: Only model installed is `qwen3-embedding:0.6b`. No llama3.2, no chat/completion model installed.
  implication: The default model llama3.2 does not exist locally; any call to Ollama's chat/completions endpoint with llama3.2 will 404.

- timestamp: 2026-04-07T00:05:00Z
  checked: packages/cli/src/commands/benchmark.command.ts lines 528-621
  found: OLLAMA_DEFAULT_MODEL = 'llama3.2' (line 529). When --model is NOT specified, the code probes /api/tags to confirm Ollama is reachable (line 600) but does NOT verify the model exists. Proceeds with hardcoded model name (line 592: completionModel = OLLAMA_DEFAULT_MODEL).
  implication: The root cause — Ollama reachability check is insufficient. It should also check if the model is pulled, or dynamically pick an available model. [FIXED]

- timestamp: 2026-04-07T01:00:00Z
  checked: packages/benchmark/src/corpus-generator.ts lines 139-148 — callCompletionApi body
  found: max_tokens: 4096 is hardcoded. User's truncation at 16951 chars ÷ 4 chars/token ≈ 4238 tokens, right at the 4096 ceiling. llama3.2 context window is 131072 — context is not the issue. The output token budget is too small for 30 queries with long Java file paths (avg path length 99 chars).
  implication: ROOT CAUSE of new failure — increase max_tokens to 8192 to give sufficient output budget for 30 queries across any project type.

## Resolution

<!-- OVERWRITE as understanding evolves -->

root_cause: Two bugs: (1) OLLAMA_DEFAULT_MODEL='llama3.2' hardcoded with no model existence check — fails 404 if llama3.2 not pulled. (2) max_tokens=4096 in callCompletionApi() too low for 30-query corpus output — Java projects with long file paths (avg 99 chars) produce ~4200+ output tokens, hitting the ceiling mid-JSON string.
fix: (1) Added isEmbeddingModel() + selectChatModel() helpers to benchmark.command.ts — Ollama probe now picks first non-embedding installed model, falls back with notice, or exits with actionable error if only embeddings installed. (2) Increased max_tokens from 4096 to 16384 in corpus-generator.ts:callCompletionApi() with explanatory comment.
verification: All 29 benchmark tests + 53 CLI tests pass. TypeScript compiles cleanly (pnpm --filter @ia-framework/benchmark exec tsc --noEmit). Fix confirmed via direct Ollama endpoint testing — finish_reason was "length" with 4096, resolved with 16384.
files_changed: [packages/cli/src/commands/benchmark.command.ts, packages/cli/src/commands/benchmark.command.test.ts, packages/benchmark/src/corpus-generator.ts]
