# API Contract: GET /api/logs

**Package**: `@ia-framework/dashboard-api`  
**Route file**: `packages/dashboard-api/src/routes/logs.ts`

## Endpoint

```
GET /api/logs
```

## Query Parameters

| Parameter | Type   | Default  | Description                                                             |
| --------- | ------ | -------- | ----------------------------------------------------------------------- |
| level     | string | `"info"` | Minimum level filter. One of: `debug`, `info`, `warn`, `error`, `fatal` |
| limit     | number | `100`    | Max number of log entries to return (from tail of file)                 |

## Response

### 200 OK

```json
{
  "entries": [
    {
      "timestamp": "2026-06-03T10:15:30.123Z",
      "level": 30,
      "levelLabel": "info",
      "component": "mcp-server",
      "msg": "Server started on stdio transport",
      "metadata": {}
    }
  ],
  "total": 42,
  "file": ".ia-framework/logs/mcp-server.log"
}
```

- `entries`: Array of LogEntry objects, ordered newest-first
- `total`: Total matching entries (before limit applied)
- `file`: Relative path to the log file (informational)

### 200 OK (no logs)

```json
{
  "entries": [],
  "total": 0,
  "file": ".ia-framework/logs/mcp-server.log"
}
```

Returned when the log file doesn't exist or is empty.

### 400 Bad Request

```json
{
  "error": "Invalid level filter. Must be one of: debug, info, warn, error, fatal"
}
```

## Level Filtering

Level filtering is inclusive of the specified level and above:

- `debug` → shows debug, info, warn, error, fatal
- `info` → shows info, warn, error, fatal
- `warn` → shows warn, error, fatal
- `error` → shows error, fatal
- `fatal` → shows fatal only

Pino numeric levels: debug=20, info=30, warn=40, error=50, fatal=60

## Error Handling

- If the log file does not exist: return empty entries (not an error)
- If a line cannot be parsed as JSON: skip it silently
- If the file cannot be read (permissions): return 500 with error message
