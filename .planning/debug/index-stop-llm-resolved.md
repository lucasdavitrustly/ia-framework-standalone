---
status: awaiting_human_verify
trigger: "index --stop flag prints output but doesn't actually stop LLM indexing"
created: 2026-04-22T00:00:00Z
updated: 2026-04-22T00:00:00Z
---

## Current Focus

hypothesis: Stop sentinel is only checked when onProgress fires (after each file completes chunking). LLM strategy takes minutes per file, so the sentinel goes undetected.
test: Traced code path — confirmed no polling, no AbortSignal, no mid-file sentinel check
expecting: N/A — root cause confirmed via code reading
next_action: Implement fix using AbortSignal + polling sentinel checker

## Symptoms

expected: Running `index --stop` should gracefully halt an in-progress LLM indexing operation
actual: The stop command prints "✓ Stop requested" but the LLM indexing continues running
errors: No error messages shown
reproduction: Start LLM indexing with `ia-framework index -s llm`, then try to stop it
started: Unknown — stop works for other strategies, only LLM strategy is affected

## Eliminated

(none — root cause found on first hypothesis)

## Evidence

- timestamp: 2026-04-22
  checked: index-stop.command.ts
  found: Writes sentinel file `indexing-stop-requested` — this works fine
  implication: The signal IS sent

- timestamp: 2026-04-22
  checked: index.command.ts progress callback (lines 448-467)
  found: Sentinel check is fire-and-forget async, runs ONLY inside onProgress callback
  implication: Check only runs when pipeline reports progress

- timestamp: 2026-04-22
  checked: pipeline.ts parsing loop (lines 231-257)
  found: onProgress fires AFTER strategy.chunk() completes for each file — one call per file
  implication: For AST (ms per file) → frequent checks. For LLM (minutes per file) → very rare checks

- timestamp: 2026-04-22
  checked: llm-chunker.ts chunkFileWithWindowing (lines 127-159)
  found: Sequential window loop making LLM calls — no abort/signal check between windows
  implication: A single large file can block for many minutes with zero opportunity to detect stop

- timestamp: 2026-04-22
  checked: pipeline.ts constructor/run signature
  found: Pipeline accepts `signal?: AbortSignal` but CLI never passes one
  implication: The abort mechanism exists but is unused

## Resolution

root_cause: The stop sentinel file is only checked inside the onProgress callback, which fires once per completed file. LLM chunking takes minutes per file (especially with windowed large files), creating long gaps where the sentinel is never checked. The pipeline supports AbortSignal but the CLI doesn't use it.
fix: (1) CLI now creates AbortController with 2s polling interval that checks sentinel file and aborts. Signal passed to pipeline.run(). Catch block handles abort gracefully. (2) AbortSignal propagated through pipeline → ChunkingConfig → LlmChunkingStrategy → chunkFile → chunkFileWithWindowing → generateChunks (fetch). (3) Signal checked between windows in chunkFileWithWindowing. (4) fetch() receives signal so in-flight Ollama requests are aborted immediately.
verification: TypeScript compiles clean. All 61 indexer tests pass. All 53 CLI tests pass.
files_changed:

- packages/cli/src/commands/index.command.ts
- packages/indexer/src/strategies/types.ts
- packages/indexer/src/pipeline.ts
- packages/indexer/src/strategies/llm-strategy.ts
- packages/indexer/src/strategies/llm-chunker.ts
- packages/indexer/src/strategies/ollama-client.ts
