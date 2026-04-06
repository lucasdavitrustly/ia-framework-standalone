---
status: resolved
trigger: "Dashboard shows 'Qdrant is unreachable — check that Docker is running' even though Docker is running and the Qdrant container is up."
created: 2026-04-06T00:00:00Z
updated: 2026-04-06T00:06:00Z
---

## Current Focus

<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: RESOLVED — human confirmed "confirmed fixed — the Qdrant is unreachable banner is gone, dashboard shows green status"
test: Human verified UI at http://localhost:3000
expecting: n/a — resolved
next_action: Archive session

## Symptoms

<!-- Written during gathering, then IMMUTABLE -->

expected: Dashboard connects to Qdrant and shows indexing status / collection stats
actual: Dashboard shows "Qdrant is unreachable — check that Docker is running"
errors: No explicit error message beyond the dashboard warning
reproduction: Run ./install.sh, open http://localhost:3000 — dashboard shows Qdrant unreachable
started: Never worked — first time running install.sh

## Eliminated

<!-- APPEND only - prevents re-investigating -->

- hypothesis: Wrong QDRANT_HOST env var not passed to container
  evidence: docker-compose.yml line 37 correctly sets QDRANT_HOST: "qdrant" — but server.ts only used this env var as a fallback when config is null. When project.json exists, config.vectorStore.host="localhost" took priority.
  timestamp: 2026-04-06T00:01:00Z

- hypothesis: project.json source defaults use "localhost" (fix source)
  evidence: Fixed persister.ts DEFAULT_VECTOR_STORE, init-config.sh template, and .ia-framework/project.json. Tests pass. But container still showed unreachable — because qdrantHost was already captured at startup before project.json was fixed.
  timestamp: 2026-04-06T00:03:00Z

- hypothesis: Network issue between containers / wrong Qdrant endpoint
  evidence: docker exec into dashboard container and ran fetch('http://qdrant:6333/readyz') — returns status 200 ok:true. Network is fine.
  timestamp: 2026-04-06T00:04:00Z

- hypothesis: Container just needed a restart to pick up project.json changes
  evidence: Container WAS restarted per user report. The structural bug is that qdrantHost is captured once at startup — even after restart, if project.json was written before this session's fix, the value is frozen.
  timestamp: 2026-04-06T00:04:00Z

## Evidence

<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-06T00:01:00Z
  checked: docker-compose.yml lines 34-41
  found: QDRANT_HOST="qdrant" is set correctly as an env var for the dashboard container
  implication: Env var is right, but was subordinate to project.json startup config

- timestamp: 2026-04-06T00:01:00Z
  checked: packages/dashboard-api/src/server.ts line 98
  found: `qdrantHost: config?.vectorStore.host ?? process.env['QDRANT_HOST'] ?? 'localhost'`
  implication: qdrantHost set ONCE at startup from config, never re-derived

- timestamp: 2026-04-06T00:04:00Z
  checked: docker exec fetch('http://qdrant:6333/readyz') from dashboard container
  found: Returns status 200, ok:true. Network connectivity is fine.
  implication: Not a network or hostname resolution issue

- timestamp: 2026-04-06T00:04:00Z
  checked: project.json mtime vs container StartedAt
  found: project.json mtime=2026-04-06T14:51:10Z, container StartedAt=2026-04-06T14:43:33Z
  implication: Container started 7.5 min before project.json was fixed — captured host="localhost" at startup forever

- timestamp: 2026-04-06T00:04:00Z
  checked: packages/dashboard-api/src/routes/status.ts and app.ts
  found: qdrantHost/qdrantPort passed as static strings to statusRouter. ConfigWatcher not passed to status route. Route uses deps.qdrantHost frozen at app creation.
  implication: Structural bug — must derive host per-request

- timestamp: 2026-04-06T00:05:00Z
  checked: curl http://localhost:3000/api/status after rebuild+restart
  found: {"qdrant":"ok","indexingInProgress":false,"lastIndexedCommit":null,...}
  implication: Fix confirmed working — Qdrant now reachable

- timestamp: 2026-04-06T00:06:00Z
  checked: Human verification of UI at http://localhost:3000
  found: "confirmed fixed — the Qdrant is unreachable banner is gone, dashboard shows green status"
  implication: Fix fully verified end-to-end

## Resolution

<!-- OVERWRITE as understanding evolves -->

root_cause: Two compounding bugs:

1. The default vectorStore.host="localhost" in project.json defaults (persister.ts, init-config.sh) meant every install produced a config that couldn't work inside Docker.
2. More critically: qdrantHost was captured ONCE at server startup from config.vectorStore.host — a frozen snapshot. Even with QDRANT_HOST="qdrant" in docker-compose.yml env vars, and even with a corrected project.json on disk, the running server always used the value it read at startup. If the container started before project.json was corrected (which happens in any real install), the server was permanently stuck with "localhost".

fix:

1. packages/project-detector/src/persister.ts — DEFAULT_VECTOR_STORE.host: "localhost" → "qdrant"
2. scripts/init-config.sh — fallback template vectorStore.host: "localhost" → "qdrant"
3. .ia-framework/project.json — existing config host: "localhost" → "qdrant"
4. packages/dashboard-api/src/routes/status.ts — replaced static qdrantHost/qdrantPort deps with configWatcher; now derives host per-request with priority: QDRANT_HOST env var > config.vectorStore.host > "localhost"
5. packages/dashboard-api/src/app.ts — removed qdrantHost/qdrantPort from AppDependencies; passes configWatcher to statusRouter
6. packages/dashboard-api/src/server.ts — removed qdrantHost/qdrantPort from createApp() call

verification: curl http://localhost:3000/api/status → {"qdrant":"ok",...}. All 20 dashboard-api tests pass. All 19 project-detector tests pass. Human confirmed UI shows green status with no banner.
files_changed:

- packages/project-detector/src/persister.ts
- scripts/init-config.sh
- .ia-framework/project.json
- packages/dashboard-api/src/routes/status.ts
- packages/dashboard-api/src/app.ts
- packages/dashboard-api/src/server.ts
