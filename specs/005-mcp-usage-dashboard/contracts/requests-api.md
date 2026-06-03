# API Contract: MCP Requests

**Base path**: `/api/requests`

## GET /api/requests

List MCP requests with pagination and filtering.

### Query Parameters

| Parameter | Type              | Default | Description         |
| --------- | ----------------- | ------- | ------------------- |
| limit     | integer           | 50      | Max results (1-200) |
| offset    | integer           | 0       | Pagination offset   |
| tool_name | string            | (all)   | Filter by tool name |
| from      | string (ISO 8601) | (none)  | Start of date range |
| to        | string (ISO 8601) | (none)  | End of date range   |

### Response 200

```json
{
  "items": [
    {
      "id": "uuid",
      "sessionId": "string",
      "toolName": "search_codebase",
      "inputParams": { "query": "...", "limit": 10 },
      "inputTokens": 125,
      "outputTokens": 3400,
      "durationMs": 245,
      "timestamp": "2026-06-03T14:30:00.000Z",
      "isTruncated": false
    }
  ],
  "total": 1234,
  "limit": 50,
  "offset": 0
}
```

Note: List endpoint does NOT include `responseContent` to keep payloads small.

---

## GET /api/requests/:id

Get full details of a single request including response content.

### Path Parameters

| Parameter | Type          | Description |
| --------- | ------------- | ----------- |
| id        | string (UUID) | Request ID  |

### Response 200

```json
{
  "id": "uuid",
  "sessionId": "string",
  "toolName": "search_codebase",
  "inputParams": { "query": "authentication middleware", "limit": 10 },
  "responseContent": "... full response text ...",
  "inputTokens": 125,
  "outputTokens": 3400,
  "durationMs": 245,
  "timestamp": "2026-06-03T14:30:00.000Z",
  "isTruncated": false
}
```

### Response 404

```json
{
  "error": "Request not found"
}
```

---

## GET /api/requests/stats

Get aggregated request statistics.

### Query Parameters

| Parameter | Type              | Default | Description         |
| --------- | ----------------- | ------- | ------------------- |
| from      | string (ISO 8601) | (none)  | Start of date range |
| to        | string (ISO 8601) | (none)  | End of date range   |

### Response 200

```json
{
  "summary": {
    "totalRequests": 1234,
    "totalInputTokens": 45000,
    "totalOutputTokens": 890000,
    "avgDurationMs": 180.5,
    "requestsToday": 42
  },
  "byDay": [
    {
      "date": "2026-06-03",
      "requestCount": 42,
      "totalInputTokens": 5000,
      "totalOutputTokens": 95000,
      "avgDurationMs": 195.2
    }
  ],
  "byTool": [
    {
      "toolName": "search_codebase",
      "requestCount": 800,
      "totalInputTokens": 30000,
      "totalOutputTokens": 600000,
      "avgDurationMs": 210.0
    }
  ]
}
```
