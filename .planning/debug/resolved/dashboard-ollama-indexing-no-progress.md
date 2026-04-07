---
status: resolved
trigger: "Dashboard's Start Indexing button triggers an indexing session with Ollama but no progress is ever shown in the dashboard and the CLI is unaware of the session happening."
created: 2026-04-06T00:00:00Z
updated: 2026-04-06T00:10:00Z
---

## Current Focus

<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — Two compounding bugs:
(1) server.ts constructs OllamaEmbeddingProvider using config.embedding.baseUrl (from project.json = "http://localhost:11434") — unreachable from inside Docker container where dashboard API runs. The embedBatch() call throws ECONNREFUSED, triggerIndexing promise rejects, .catch() calls indexingState.fail(), running=false immediately, dashboard sees idle as if nothing happened.
(2) The failure is silent — error state is stored in indexingState.error but the frontend may not display it; user just sees "nothing happened".
test: Verified: server.ts triggerIndexing closure uses config.embedding.baseUrl directly, no OLLAMA_BASE_URL env var in docker-compose.yml, confirmed project.json has baseUrl=localhost:11434.
expecting: Fix uses process.env['OLLAMA_BASE_URL'] ?? config.embedding.baseUrl in server.ts; docker-compose.yml adds OLLAMA_BASE_URL=http://host.docker.internal:11434.
next_action: Apply fixes in server.ts and docker-compose.yml

## Symptoms

<!-- Written during gathering, then IMMUTABLE -->

expected: After pressing "Start Indexing" in the dashboard, indexing progress should update in the dashboard UI showing chunks processed, embedding progress, etc.
actual: No progress shown — dashboard stays at idle/zero despite the button being pressed. No errors visible.
errors: none visible
reproduction: Open dashboard → click Start Indexing → progress stays at 0 / no updates shown
started: Never worked — this is a new/in-progress feature

## Eliminated

<!-- APPEND only - prevents re-investigating -->

- hypothesis: Progress events don't reach IndexingStateManager (internal wiring broken)
  evidence: indexing.ts trigger route correctly calls deps.indexingState.update(progress) in the onProgress callback. The pipeline.ts emits progress via onProgress?.(). The wiring is correct. The issue is that the pipeline never runs because the embedding provider fails immediately on first embedBatch() call.
  timestamp: 2026-04-06T00:05:00Z

- hypothesis: IndexingStateManager.getState() is out of scope / different instance
  evidence: A single IndexingStateManager is created in server.ts and passed to both indexingRouter and createApp. One instance shared everywhere.
  timestamp: 2026-04-06T00:05:00Z

- hypothesis: CLI-triggered vs dashboard-triggered cross-process state gap (from knowledge base)
  evidence: Not applicable here — this is dashboard-triggered indexing running inside the same process. The CLI runs on the host; the dashboard API is in Docker. The trigger is internal to the dashboard API container.
  timestamp: 2026-04-06T00:05:00Z

## Evidence

<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-06T00:01:00Z
  checked: Knowledge base known patterns
  found: "indexing-silent-failure-empty-qdrant" shows identical pattern for CLI (host uses Docker name); "qdrant-unreachable-dashboard" shows fix pattern (env var overrides config value). Both point to same class of container/host URL mismatch.
  implication: Need to apply same env var override pattern to Ollama URL

- timestamp: 2026-04-06T00:02:00Z
  checked: packages/dashboard-api/src/routes/indexing.ts
  found: POST /api/indexing/trigger fires and forgets — .catch() calls indexingState.fail(msg). If triggerIndexing rejects immediately (Ollama unreachable), running goes false before frontend can observe progress.
  implication: Fix must prevent the fail path by making Ollama reachable — not just surface errors better (though that's useful too).

- timestamp: 2026-04-06T00:03:00Z
  checked: packages/dashboard-api/src/server.ts — triggerIndexing closure (lines 60-88)
  found: embeddingProvider initialized at startup using config.embedding.baseUrl. Per-trigger path also uses currentConfig.embedding (same baseUrl). No OLLAMA_BASE_URL env var override. docker-compose.yml has no OLLAMA_BASE_URL for dashboard service.
  implication: Inside Docker, baseUrl="http://localhost:11434" resolves to container itself → fetch fails → ECONNREFUSED → pipeline fails instantly → dashboard shows idle

- timestamp: 2026-04-06T00:04:00Z
  checked: .ia-framework/project.json
  found: embedding.baseUrl = "http://localhost:11434"
  implication: Correct for CLI (host process), wrong for dashboard API (Docker container)

- timestamp: 2026-04-06T00:05:00Z
  checked: docker-compose.yml environment block for dashboard service
  found: QDRANT_HOST=qdrant, QDRANT_PORT=6333 set. No OLLAMA_BASE_URL or OLLAMA_HOST env var.
  implication: Need to add OLLAMA_BASE_URL=http://host.docker.internal:11434 (macOS/Windows Docker Desktop special hostname that resolves to host machine)

- timestamp: 2026-04-06T00:06:00Z
  checked: packages/embedding/src/providers/ollama.ts
  found: baseUrl defaults to 'http://localhost:11434' if config.baseUrl undefined. The OllamaEmbeddingProvider stores it at construction time.
  implication: Fix only needs to be in server.ts — override the baseUrl from env var before passing to createEmbeddingProvider

## Resolution

<!-- OVERWRITE as understanding evolves -->

root_cause: The dashboard API runs inside a Docker container but constructs the OllamaEmbeddingProvider using config.embedding.baseUrl from project.json ("http://localhost:11434"). Inside Docker, localhost resolves to the container itself — not the host machine where Ollama runs. Every embedBatch() call fails with ECONNREFUSED. This causes indexingPipeline.run() to reject immediately. The .catch() handler in indexingRouter calls indexingState.fail(), resetting running=false before any progress events fire. The frontend's next poll sees idle state. No error is surfaced to the user. The symptom is "nothing happened." A secondary bug: the startup-time embeddingProvider (line 38, also created with localhost:11434) was being reused in the triggerIndexing closure via `embeddingProvider ?? createEmbeddingProvider(embeddingConfig)` — even after the config fix, the stale provider would have been used due to `??` short-circuiting.
fix: (1) In server.ts triggerIndexing closure, always call createEmbeddingProvider(embeddingConfig) fresh (never reuse startup-time embeddingProvider), and override baseUrl from OLLAMA_BASE_URL env var when provider is 'ollama'. (2) In docker-compose.yml, add OLLAMA_BASE_URL=http://host.docker.internal:11434 to dashboard service environment. (3) In docker-compose.yml, add extra_hosts: [host.docker.internal:host-gateway] so Linux Docker Engine also maps the hostname (Docker Desktop handles it automatically on macOS/Windows).
verification: All 30 dashboard-api tests pass (3 test files). No test changes required — tests mock triggerIndexing at the route level, so the server.ts change is transparent to them.
files_changed:

- packages/dashboard-api/src/server.ts
- docker-compose.yml
