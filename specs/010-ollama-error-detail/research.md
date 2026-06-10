# Research: Detailed Ollama Error Reporting

**Feature**: 010-ollama-error-detail | **Date**: 2026-06-10

## Research Questions

### RQ-1: What is Ollama's error response format?

**Decision**: Ollama returns errors in two formats depending on the error type.

**Findings**:

1. **HTTP API errors** (non-2xx): Response body is JSON with an `"error"` field:

   ```json
   { "error": "model 'xyz' not found, try pulling it first" }
   ```

   Common status codes:
   - `404`: Model not found
   - `500`: Internal server error (OOM, context overflow, model crashed)
   - `400`: Bad request (invalid parameters)

2. **Network-level failures** (Ollama not running): Node.js `fetch()` throws a `TypeError` with:
   - `cause.code === 'ECONNREFUSED'` — server not running
   - `cause.code === 'ETIMEDOUT'` — server unreachable
   - `cause.code === 'UND_ERR_CONNECT_TIMEOUT'` — undici timeout

3. **Stream/crash failures**: Ollama may return 200 OK and then crash mid-stream. Since we use `stream: false`, this manifests as a connection reset or incomplete JSON body.

**Alternatives considered**: Using Ollama's official JS client (`ollama-js`) — rejected because the project already uses raw `fetch()` for both endpoints and adding a client library adds a dependency against Principle V (Simplicity).

---

### RQ-2: How should error categories be detected?

**Decision**: Pattern-match on response body text and error codes, not HTTP status alone.

**Rationale**: Ollama uses 500 for many different failures (OOM, model crash, context overflow). The response body text is the only reliable way to differentiate:

- `"model '...' not found"` → model-not-found
- `"ECONNREFUSED"` or TypeError with cause.code → connection-refused
- JSON parse failure in our code → parse-failure
- Everything else → server-error (if HTTP error) or unknown

**Alternatives considered**: Strict HTTP status code mapping (404 = model not found, 500 = server error) — rejected because Ollama sometimes returns 500 for model-not-found scenarios depending on version.

---

### RQ-3: Where should the error utility live?

**Decision**: `packages/indexer/src/errors/ollama-errors.ts` — inside the indexer package.

**Rationale**:

- The enricher lives in `@ia-framework/indexer`
- The pipeline (which handles embedding errors) lives in `@ia-framework/indexer`
- The embedding provider (`@ia-framework/embedding`) already includes the response body in its error — only the enricher and pipeline need the formatting utility
- Putting it in indexer avoids creating a circular dependency (embedding doesn't need to import from indexer)

**Alternatives considered**:

- `packages/core/src/errors/` — rejected because core is for shared types/config, not utility functions
- `packages/embedding/src/errors/` — rejected because the primary consumer is the indexer package

---

### RQ-4: Should error body truncation preserve JSON structure?

**Decision**: No — truncate at byte boundary with a clear marker. Do not attempt to preserve JSON structure.

**Rationale**:

- Response bodies may not be JSON (HTML error pages, plain text, binary)
- Truncating at a JSON boundary adds complexity with minimal benefit
- The marker `... [truncated, full response was N bytes]` makes it clear information was cut
- 2KB is generous enough to capture most Ollama error messages in full (typical errors are <500 bytes)

**Alternatives considered**: Smart truncation that closes JSON brackets — rejected as over-engineering for error diagnostics.

---

### RQ-5: Should connection errors use a different error class?

**Decision**: No — use the same `Error` class with a formatted message string. Do not introduce custom error classes.

**Rationale**:

- The existing code uses plain `Error` throughout
- Introducing `OllamaConnectionError`, `OllamaModelError`, etc. would be an abstraction layer that adds complexity against Principle V
- The formatted message string contains all necessary information for logging and debugging
- Error categorization is done by the formatting utility for the guidance text, not by error class hierarchy

**Alternatives considered**: Custom error class hierarchy (`OllamaError extends Error` with `category`, `suggestion` fields) — rejected per Principle V (Simplicity). A formatting function is lighter and sufficient.
