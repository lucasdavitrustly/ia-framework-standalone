# Feature Specification: Detailed Ollama Error Reporting

**Feature Branch**: `010-ollama-error-detail`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "When Ollama fails during Embedding or Enrichment phase, show more detailed error, the ollama response and etc."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - See Ollama's actual error message on enrichment failure (Priority: P1)

A developer is running the indexing pipeline and Ollama fails during the enrichment phase (e.g., model not loaded, context overflow, server crash). The system currently shows only `"Ollama API error: 500 Internal Server Error"` — losing the detailed error message Ollama returned (e.g., "model 'qwen3:8b' not found, try pulling it first"). The developer needs the actual Ollama response body to diagnose and fix the problem without guessing.

**Why this priority**: This is the primary gap — the enricher discards the Ollama response body entirely. Users cannot diagnose failures without the actual error message from Ollama.

**Independent Test**: Can be tested by making an enrichment call to a non-existent model and verifying the full Ollama error message appears in the output.

**Acceptance Scenarios**:

1. **Given** Ollama returns a non-2xx response during enrichment, **When** the error is logged, **Then** the log includes the HTTP status code, the full Ollama response body, and the model name that was called.
2. **Given** Ollama is not running (connection refused), **When** the enrichment call fails, **Then** the error message clearly states that Ollama is unreachable at the configured URL and suggests checking if the server is running.
3. **Given** Ollama returns a 2xx response but with malformed/unparseable JSON, **When** the response is processed, **Then** the error includes the raw response text that failed to parse.

---

### User Story 2 - See detailed error on embedding failure (Priority: P2)

A developer is running the indexing pipeline and Ollama fails during the embedding phase. The pipeline currently logs `"Embedding batch skipped after retry failure"` without including the actual error from Ollama (the catch block swallows the error object). The developer needs to see what went wrong — model not loaded, dimension mismatch, out of memory, etc.

**Why this priority**: The embedding provider already captures the response body, but the pipeline's error handler discards it when logging. This is a simpler fix (propagate existing info) but equally important for diagnosis.

**Independent Test**: Can be tested by calling embed with a non-existent model and verifying the error details (model name, status code, Ollama message) appear in the pipeline's log output.

**Acceptance Scenarios**:

1. **Given** Ollama returns a non-2xx response during embedding, **When** the pipeline logs the embedding failure, **Then** the log includes the HTTP status code, Ollama response body, the model name, and the batch size that failed.
2. **Given** an embedding batch fails all retry attempts, **When** the pipeline skips the batch, **Then** the final skip message includes the error details from the last attempt (not just "skipped after retry failure").
3. **Given** Ollama is not running during the embedding phase, **When** the connection is refused, **Then** the error clearly indicates Ollama is unreachable and includes the configured URL.

---

### User Story 3 - Categorized error messages with actionable guidance (Priority: P3)

When an Ollama error occurs, the developer wants to quickly understand what went wrong and what to do about it. Instead of a raw error dump, the system should categorize common failure modes and provide actionable guidance alongside the raw Ollama response.

**Why this priority**: This improves developer experience beyond just showing raw errors — but the raw errors (US1/US2) are the essential foundation.

**Independent Test**: Can be tested by triggering known failure modes (model not found, connection refused, context overflow) and verifying each produces a distinct, categorized message with a suggested action.

**Acceptance Scenarios**:

1. **Given** Ollama returns a "model not found" error, **When** the error is displayed, **Then** the message includes guidance to pull the model (e.g., "Try running: ollama pull <model>").
2. **Given** the connection to Ollama is refused, **When** the error is displayed, **Then** the message includes guidance to start Ollama (e.g., "Ensure Ollama is running: ollama serve").
3. **Given** Ollama returns an unknown/unexpected error, **When** the error is displayed, **Then** the raw response is shown without categorization (never hide information).

---

### Edge Cases

- What happens when Ollama returns an empty body on error (non-2xx with no content)?
- What happens when the response body is extremely large (e.g., a stack trace exceeding 10KB)?
- How does the system handle a timeout (Ollama takes too long to respond)?
- What happens when Ollama returns 200 OK but the response is not valid JSON?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: When Ollama returns a non-2xx HTTP status during enrichment, the error message MUST include the HTTP status code and the full response body from Ollama.
- **FR-002**: When Ollama returns a non-2xx HTTP status during embedding, the pipeline log MUST include the HTTP status code, the response body, the model name, and the batch size.
- **FR-003**: When Ollama is unreachable (connection refused/timeout), the error MUST clearly state the configured URL that was unreachable.
- **FR-004**: When Ollama returns 200 OK but the response body cannot be parsed as expected JSON, the error MUST include the raw response text.
- **FR-005**: The enrichment error message MUST include the model name used in the failed call.
- **FR-006**: The embedding pipeline error handler MUST propagate the underlying error details (not discard them) when logging skip messages.
- **FR-007**: For known error categories (model not found, connection refused), the error output MUST include an actionable suggestion alongside the raw error.
- **FR-008**: Response bodies exceeding 2KB MUST be truncated with a marker indicating truncation, to avoid flooding logs.
- **FR-009**: All error improvements MUST NOT change the existing skip/retry behavior — only the information content of error messages is affected.

### Key Entities

- **OllamaError**: Structured representation of an Ollama failure — includes HTTP status, response body, model name, base URL, error category (connection, model-not-found, parse-failure, server-error, unknown)
- **ErrorCategory**: Classification of common Ollama failures with associated guidance messages

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: When Ollama returns an error during enrichment, 100% of the response body content (up to 2KB) is visible in the error output.
- **SC-002**: When Ollama returns an error during embedding, the pipeline log includes the model name, status code, and response body in the skip message.
- **SC-003**: Connection-refused errors clearly identify the URL that was unreachable and suggest starting Ollama.
- **SC-004**: Developers can diagnose and resolve common Ollama failures (model not found, server not running) from the error message alone, without needing to check Ollama logs separately.

## Assumptions

- Ollama's error response format is a JSON object with an `"error"` field (based on current Ollama API behavior). Non-JSON error bodies are also possible and should be handled.
- The existing retry logic and skip-on-failure behavior remains unchanged — this feature only improves the information content of error messages.
- Errors are logged via the existing pino logger (structured logging) and console.warn (user-facing output). No new logging infrastructure is needed.
- The feature targets the two Ollama-calling code paths: enrichment (`/api/generate` in enricher.ts) and embedding (`/api/embed` in ollama.ts provider + pipeline handler).
- Truncation at 2KB for response bodies is a reasonable default that balances information completeness with log readability.
