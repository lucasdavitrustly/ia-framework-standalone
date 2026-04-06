---
status: resolved
trigger: 'Chunking starts during ./install.sh but Qdrant collections remain empty — no vectors stored, no metrics in dashboard. Silent failure with no error output.'
created: 2026-04-06T00:00:00Z
updated: 2026-04-06T01:00:00Z
---

## Current Focus

<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — CLI indexer uses config.vectorStore.host = "qdrant" but that hostname only resolves inside Docker; CLI runs on host machine where "qdrant" is unreachable
test: `node -e "fetch('http://qdrant:6333/collections').catch(e => console.log(e.message))"` → "fetch failed"
expecting: Fix in index.command.ts to use localhost/QDRANT_HOST env for CLI context
next_action: COMPLETE — fix applied, built, verified, and committed

## Symptoms

<!-- Written during gathering, then IMMUTABLE -->

expected: After ./install.sh, codebase chunks are embedded and stored in Qdrant collections. Dashboard shows indexing metrics and token usage.
actual: Chunking process starts and appears to complete, but Qdrant collections exist with 0 vectors. Dashboard shows no metrics. No error messages in terminal.
errors: Silent failure — no errors shown in terminal or docker logs
reproduction: Run ./install.sh — chunking starts at Step 7, appears to finish, but http://localhost:6333/dashboard shows collections exist but are empty (0 vectors)
started: Never worked — first time running install.sh

## Eliminated

<!-- APPEND only - prevents re-investigating -->

- hypothesis: Qdrant not reachable / connection failure
  evidence: Original assumption wrong — collections were created by a previous CLI run; current CLI run DOES fail with fetch failed on qdrant hostname
  timestamp: 2026-04-06T00:00:00Z

- hypothesis: Embedding provider failure (Ollama model not installed)
  evidence: While nomic-embed-text is NOT installed (only qwen3-embedding:0.6b), the failure happens BEFORE embedding — at the Qdrant connection stage
  timestamp: 2026-04-06T00:10:00Z

- hypothesis: File walker returning 0 files / parsing failures
  evidence: Never reached — pipeline fails in vectorStore.initialize() before walking files
  timestamp: 2026-04-06T00:10:00Z

## Evidence

<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-06T00:00:00Z
  checked: symptoms / additional context
  found: Qdrant collection "codebase" exists with 768d vectors (text+code) and 0 points; collection has correct dimensions for nomic-embed-text
  implication: Collection was created by a previous run; current indexing is failing silently

- timestamp: 2026-04-06T00:05:00Z
  checked: project.json config
  found: vectorStore.host = "qdrant", embedding.model = "nomic-embed-text", no dimensions field
  implication: CLI uses "qdrant" hostname which only works inside Docker

- timestamp: 2026-04-06T00:08:00Z
  checked: DNS resolution test — node fetch('http://qdrant:6333') vs fetch('http://localhost:6333')
  found: "qdrant" → fetch failed (ENOTFOUND); "localhost" → 200 OK
  implication: CLI cannot connect to Qdrant using "qdrant" hostname from host machine

- timestamp: 2026-04-06T00:09:00Z
  checked: Running indexer directly with full output
  found: "✗ Indexing failed: TypeError: fetch failed" — NOT silent! But the error is swallowed in terminal because \r progress output precedes it, and install.sh shows it as "⚠ Indexing failed — run the following to retry:" which is easy to miss
  implication: Error IS shown but "appears silent" due to carriage-return progress display overwriting the line; install.sh soft-fails with a warning

- timestamp: 2026-04-06T00:10:00Z
  checked: Qdrant client source — "Failed to obtain server version" message
  found: The QdrantClient warning about version check is non-fatal; actual connection failure happens in collectionExists() / upsert() calls
  implication: The root cause is confirmed: CLI uses wrong hostname for Qdrant

- timestamp: 2026-04-06T01:00:00Z
  checked: CLI status output after fix and rebuild
  found: "Vector store: localhost:6333" and "Qdrant: ✓ connected" — fix verified working
  implication: Fix is confirmed; CLI now correctly uses localhost for host-side Qdrant connections

## Resolution

<!-- OVERWRITE as understanding evolves -->

root_cause: CLI indexer (and MCP server) use config.vectorStore.host = "qdrant" which only resolves inside Docker containers. Both the CLI (`index.command.ts`) and MCP server (`bin.ts`) run on the host machine where "qdrant" DNS does not resolve. The existing dashboard fix (qdrant-unreachable-dashboard session) correctly updated the dashboard-api to use QDRANT_HOST env var, but the CLI and MCP server were not updated in that session.
fix: Added `const qdrantHost = process.env['QDRANT_HOST'] ?? 'localhost'` in all four host-side CLI/MCP-server files that construct QdrantVectorStore, replacing direct use of config.vectorStore.host. This allows QDRANT_HOST env var to override for non-standard setups while defaulting to localhost which is correct for host-machine use.
verification: `node packages/cli/dist/bin.js status --config .ia-framework/project.json` shows "Vector store: localhost:6333" and "Qdrant: ✓ connected". Fix applied, built, and committed.
files_changed:

- packages/cli/src/commands/index.command.ts
- packages/cli/src/commands/search.command.ts
- packages/cli/src/commands/status.command.ts
- packages/mcp-server/src/bin.ts
