# Data Model: Install Script Resilience & Defaults

**Feature**: 003-install-resilience | **Date**: 2026-06-03

## Entities

### LogEntry

Represents a single parsed log line from the MCP server log file.

| Field      | Type                    | Description                                                                   |
| ---------- | ----------------------- | ----------------------------------------------------------------------------- |
| timestamp  | string (ISO 8601)       | When the log was emitted                                                      |
| level      | number                  | Pino numeric level (10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal) |
| levelLabel | string                  | Human-readable level (`debug`, `info`, `warn`, `error`, `fatal`)              |
| component  | string                  | Logger name (e.g., `mcp-server`, `mcp-server:index-db-schema`)                |
| msg        | string                  | Log message                                                                   |
| metadata   | Record<string, unknown> | Optional additional fields from pino JSON                                     |

**Source**: `.ia-framework/logs/mcp-server.log` (one JSON object per line, pino format)

**Validation**: Each line must be valid JSON with at minimum `level`, `time`, and `msg` fields. Malformed lines are skipped.

---

### RepoEntry

Represents a repository in the multi-repo project configuration.

| Field | Type   | Description                                                 |
| ----- | ------ | ----------------------------------------------------------- |
| name  | string | Derived from path basename (e.g., `/foo/bar/core` → `core`) |
| path  | string | Absolute filesystem path to the repository root             |

**Validation**: `path` must be a non-empty string. `name` must be a non-empty string matching `[a-zA-Z0-9_-]+`.

---

### ProjectConfig (updated schema)

The full `project.json` schema with new/modified fields highlighted.

| Field                       | Type        | Required | Notes                                   |
| --------------------------- | ----------- | -------- | --------------------------------------- |
| repos                       | RepoEntry[] | Yes      | **NEW** — replaces `targetProjectPath`  |
| embedding.provider          | string      | Yes      | `"ollama"` or `"openai"`                |
| embedding.model             | string      | Yes      | Default: `"qwen3-embedding:0.6b"`       |
| embedding.baseUrl           | string      | Yes      | Default: `"http://localhost:11434"`     |
| embedding.dimensions        | number      | Yes      | Default: `1024`                         |
| embedding.prefixes          | object      | Yes      | **NEW**                                 |
| embedding.prefixes.document | string      | Yes      | Default: `"search_document: "`          |
| embedding.prefixes.query    | string      | Yes      | Default: `"search_query: "`             |
| vectorStore.host            | string      | Yes      | Default: `"localhost"` (was `"qdrant"`) |
| vectorStore.port            | number      | Yes      | Default: `6333`                         |
| vectorStore.collectionName  | string      | Yes      | Default: `"codebase"`                   |

---

## State Transitions

### Node Version Gate (install.sh flow)

```
[Start] → check_node_active()
  ├── Node 22+ active → [PASS] → continue install
  └── Node not active
       → display_version_error()
       → prompt "Install Node 22?"
         ├── Yes → install_node() → re-check
         │    ├── Now active → [PASS]
         │    └── Still not active → display_activate_msg() → exit 1
         └── No → exit 1
```

### Config Merge (init-config.sh flow)

```
[Start] → check if project.json exists
  ├── No → write new config (repos format) → done
  └── Yes → backup to .bak
       → merge missing fields:
         - targetProjectPath → repos conversion
         - add prefixes if missing
         - set host=localhost if host=qdrant
       → write merged config → done
```
