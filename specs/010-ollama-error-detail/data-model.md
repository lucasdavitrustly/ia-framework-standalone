# Data Model: Detailed Ollama Error Reporting

**Feature**: 010-ollama-error-detail | **Date**: 2026-06-10

## Entity: OllamaErrorContext

**Purpose**: Input to the error formatting utility — captures all relevant context from a failed Ollama API call.

| Field   | Type                          | Required | Description                                              |
| ------- | ----------------------------- | -------- | -------------------------------------------------------- |
| status  | `number \| undefined`         | No       | HTTP status code (undefined for connection errors)       |
| body    | `string`                      | Yes      | Response body text (or error message for network errors) |
| model   | `string`                      | Yes      | Model name used in the call                              |
| baseUrl | `string`                      | Yes      | Ollama base URL that was called                          |
| phase   | `'enrichment' \| 'embedding'` | Yes      | Which pipeline phase the error occurred in               |

## Entity: OllamaErrorCategory

**Purpose**: Classification of the error for actionable guidance.

| Value             | Detection Pattern                              | Guidance Message                                              |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| `connection`      | TypeError with ECONNREFUSED/ETIMEDOUT in cause | "Ensure Ollama is running: ollama serve"                      |
| `model-not-found` | Body contains "not found" or status 404        | "Try running: ollama pull \<model\>"                          |
| `parse-failure`   | JSON.parse fails on a 200 OK response          | "Ollama returned invalid JSON — check server logs"            |
| `server-error`    | HTTP 5xx with parseable error body             | "Ollama internal error — check server logs or restart Ollama" |
| `unknown`         | None of the above patterns match               | (no guidance — show raw error only)                           |

## Formatting Rules

### Truncation

- Response bodies > 2048 bytes are truncated
- Truncation marker: `... [truncated, full response was {N} bytes]`
- Truncation preserves the first 2048 bytes (most relevant info is at the start)

### Output Format

```
Ollama {phase} error ({category}): {status} — {extracted_error_message}
  Model: {model}
  URL: {baseUrl}
  Response: {body_or_truncated_body}
  Suggestion: {guidance_message}
```

For connection errors (no HTTP status):

```
Ollama {phase} error (connection): Cannot reach Ollama at {baseUrl}
  Model: {model}
  Error: {underlying_error_message}
  Suggestion: Ensure Ollama is running: ollama serve
```

## Constants

| Constant              | Value | Location         | Purpose                    |
| --------------------- | ----- | ---------------- | -------------------------- |
| MAX_ERROR_BODY_LENGTH | 2048  | ollama-errors.ts | Truncation threshold       |
| ERROR_CATEGORIES      | Map   | ollama-errors.ts | Pattern → category mapping |

## Relationships

```
Pipeline.run()
  ├── enricher.callOllama()
  │     └── on error → formatOllamaError({ status, body, model, baseUrl, phase: 'enrichment' })
  │                      └── categorize → truncate → format → throw Error(formatted)
  │
  └── embedBatchAndStore() → OllamaEmbeddingProvider.embedBatch()
        └── on error → catch(err) → logger.warn(err.message) with error details
                        └── err.message already includes status + body (from provider)
                            pipeline adds: model name, batch size, suggestion
```

## Design Decisions

### No Custom Error Classes (RQ-5)

Plain `Error` objects with formatted message strings. No `OllamaError extends Error` class hierarchy. The formatting utility is a pure function, not a class.

### Utility in Indexer Package (RQ-3)

The formatting utility lives in `packages/indexer/src/errors/ollama-errors.ts` because both consumers (enricher + pipeline) are in the indexer package. The embedding provider already includes adequate error info.
