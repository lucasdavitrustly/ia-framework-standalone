# Tasks: Detailed Ollama Error Reporting

**Input**: Design documents from `/specs/010-ollama-error-detail/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Included — TDD required per project constitution.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `packages/indexer/src/`, `packages/embedding/src/`
- Tests colocated: `packages/indexer/src/errors/__tests__/`, `packages/embedding/src/providers/__tests__/`

---

## Phase 1: Setup

**Purpose**: Create directory structure for new error utility module

- [x] T001 Create errors directory at packages/indexer/src/errors/
- [x] T002 [P] Create test directory at packages/indexer/src/errors/**tests**/

**Checkpoint**: Directory structure ready for implementation.

---

## Phase 2: Foundational — Error Formatting Utility

**Purpose**: Create the shared `formatOllamaError` utility that all user stories depend on

**Blocked by**: Phase 1

### Tests (Write FIRST — must FAIL before implementation)

- [x] T003 [P] Write unit test: formatOllamaError returns status code and response body for HTTP errors in packages/indexer/src/errors/**tests**/ollama-errors.test.ts
- [x] T004 [P] Write unit test: formatOllamaError includes model name and baseUrl in output in packages/indexer/src/errors/**tests**/ollama-errors.test.ts
- [x] T005 [P] Write unit test: truncateBody truncates strings exceeding 2048 bytes with marker in packages/indexer/src/errors/**tests**/ollama-errors.test.ts
- [x] T006 [P] Write unit test: truncateBody returns strings under 2048 bytes unchanged in packages/indexer/src/errors/**tests**/ollama-errors.test.ts
- [x] T007 [P] Write unit test: categorizeOllamaError returns 'connection' for ECONNREFUSED errors in packages/indexer/src/errors/**tests**/ollama-errors.test.ts
- [x] T008 [P] Write unit test: categorizeOllamaError returns 'model-not-found' when body contains "not found" in packages/indexer/src/errors/**tests**/ollama-errors.test.ts
- [x] T009 [P] Write unit test: categorizeOllamaError returns 'server-error' for 5xx with parseable body in packages/indexer/src/errors/**tests**/ollama-errors.test.ts
- [x] T010 [P] Write unit test: categorizeOllamaError returns 'unknown' when no patterns match in packages/indexer/src/errors/**tests**/ollama-errors.test.ts
- [x] T011 [P] Write unit test: formatOllamaError includes actionable suggestion for 'model-not-found' category in packages/indexer/src/errors/**tests**/ollama-errors.test.ts
- [x] T012 [P] Write unit test: formatOllamaError includes actionable suggestion for 'connection' category in packages/indexer/src/errors/**tests**/ollama-errors.test.ts

### Implementation

- [x] T013 Implement `truncateBody(body: string, maxLength?: number): string` in packages/indexer/src/errors/ollama-errors.ts
- [x] T014 Implement `categorizeOllamaError(ctx: OllamaErrorContext): OllamaErrorCategory` in packages/indexer/src/errors/ollama-errors.ts
- [x] T015 Implement `formatOllamaError(ctx: OllamaErrorContext): string` in packages/indexer/src/errors/ollama-errors.ts
- [x] T016 Export all public types and functions from packages/indexer/src/errors/ollama-errors.ts
- [x] T017 Run utility tests and verify all pass: `pnpm --filter @ia-framework/indexer test -- ollama-errors`

**Checkpoint**: Error formatting utility complete with full test coverage. All categorization and truncation logic validated.

---

## Phase 3: User Story 1 — Enrichment Error Details (Priority: P1)

**Goal**: When Ollama fails during enrichment, show the actual response body, model name, and actionable guidance instead of just "Ollama API error: 500 Internal Server Error"

**Independent Test**: Trigger enrichment with a non-existent model; verify the full Ollama error message (including "model not found" body text) appears in the output

### Tests (Write FIRST — must FAIL before implementation)

- [x] T018 [P] [US1] Write unit test: callOllama throws error containing response body text on non-2xx response in packages/indexer/src/**tests**/enricher-errors.test.ts
- [x] T019 [P] [US1] Write unit test: callOllama throws error containing model name on non-2xx response in packages/indexer/src/**tests**/enricher-errors.test.ts
- [x] T020 [P] [US1] Write unit test: callOllama throws formatted connection error when fetch fails with TypeError in packages/indexer/src/**tests**/enricher-errors.test.ts
- [x] T021 [P] [US1] Write unit test: callOllama throws error with raw text when 200 response has invalid JSON in packages/indexer/src/**tests**/enricher-errors.test.ts
- [x] T022 [P] [US1] Write unit test: enrichBatch logs full error details (including body) when skipOnFailure is true in packages/indexer/src/**tests**/enricher-errors.test.ts

### Implementation

- [x] T023 [US1] Import formatOllamaError into packages/indexer/src/enrichment/enricher.ts
- [x] T024 [US1] Modify callOllama() to read `response.text()` on non-2xx and throw formatted error with body, model, baseUrl in packages/indexer/src/enrichment/enricher.ts
- [x] T025 [US1] Wrap fetch() call in try/catch to handle TypeError (connection refused) with formatted error in packages/indexer/src/enrichment/enricher.ts
- [x] T026 [US1] Add try/catch around JSON parse of response body to handle malformed 200 OK responses in packages/indexer/src/enrichment/enricher.ts
- [x] T027 [US1] Run enricher error tests and verify all pass: `pnpm --filter @ia-framework/indexer test -- enricher-errors`

**Checkpoint**: US1 complete — enrichment errors now include full Ollama response body, model name, and actionable suggestions.

---

## Phase 4: User Story 2 — Embedding Error Propagation (Priority: P2)

**Goal**: When Ollama fails during embedding, propagate the actual error details into the pipeline's skip message instead of swallowing the error object

**Independent Test**: Trigger embedding with a non-existent model; verify the pipeline log includes status code, model name, and Ollama error body in the skip message

### Tests (Write FIRST — must FAIL before implementation)

- [x] T028 [P] [US2] Write unit test: OllamaEmbeddingProvider includes model name in error message on non-2xx response in packages/embedding/src/providers/**tests**/ollama-errors.test.ts
- [x] T029 [P] [US2] Write unit test: pipeline embedding catch block includes error message in logger.warn call in packages/indexer/src/**tests**/pipeline-embedding-errors.test.ts
- [x] T030 [P] [US2] Write unit test: pipeline embedding skip message includes batch size and error details in packages/indexer/src/**tests**/pipeline-embedding-errors.test.ts

### Implementation

- [x] T031 [US2] Add model name to error message in OllamaEmbeddingProvider.embedBatch() in packages/embedding/src/providers/ollama.ts
- [x] T032 [US2] Fix pipeline embedding catch block to capture error variable (change bare `catch {}` to `catch (err)`) in packages/indexer/src/pipeline.ts
- [x] T033 [US2] Include `err.message` in the logger.warn metadata when logging embedding batch skip in packages/indexer/src/pipeline.ts
- [x] T034 [US2] Run embedding error tests and verify all pass: `pnpm --filter @ia-framework/indexer test -- pipeline-embedding-errors && pnpm --filter @ia-framework/embedding test`

**Checkpoint**: US2 complete — embedding failures now propagate full error details to the pipeline skip log.

---

## Phase 5: User Story 3 — Categorized Error Guidance (Priority: P3)

**Goal**: Provide actionable suggestions for common Ollama errors (model not found → pull, connection refused → start server) alongside the raw error

**Independent Test**: Trigger "model not found" error; verify the output includes both the raw Ollama response AND a suggestion to run `ollama pull <model>`

**Blocked by**: Phase 2 (utility already implements categorization), Phase 3 (enricher uses formatOllamaError which includes suggestions)

### Tests (Write FIRST — must FAIL before implementation)

- [x] T035 [P] [US3] Write unit test: formatOllamaError for connection error includes "ollama serve" suggestion in packages/indexer/src/errors/**tests**/ollama-errors.test.ts
- [x] T036 [P] [US3] Write unit test: formatOllamaError for model-not-found includes "ollama pull" suggestion with model name in packages/indexer/src/errors/**tests**/ollama-errors.test.ts
- [x] T037 [P] [US3] Write unit test: formatOllamaError for unknown error shows raw response without suggestion in packages/indexer/src/errors/**tests**/ollama-errors.test.ts

### Implementation

- [x] T038 [US3] Verify categorizeOllamaError pattern matching covers "not found" (case-insensitive) in packages/indexer/src/errors/ollama-errors.ts
- [x] T039 [US3] Verify formatOllamaError suggestion for 'connection' includes the actual baseUrl in packages/indexer/src/errors/ollama-errors.ts
- [x] T040 [US3] Verify formatOllamaError suggestion for 'model-not-found' includes the actual model name in packages/indexer/src/errors/ollama-errors.ts
- [x] T041 [US3] Run US3 tests and verify all pass: `pnpm --filter @ia-framework/indexer test -- ollama-errors`

**Checkpoint**: US3 complete — common errors include actionable guidance, unknown errors show raw response.

---

## Phase 6: Polish & Validation

**Purpose**: Full test suite pass, build verification, cross-cutting concerns

- [x] T042 Run full test suite across all affected packages: `pnpm --filter @ia-framework/indexer test && pnpm --filter @ia-framework/embedding test`
- [x] T043 Run full build to verify no type errors: `pnpm build`
- [x] T044 [P] Verify existing tests still pass (no regressions from changed error messages): `pnpm test`
- [ ] T045 [P] Run quickstart.md manual verification steps (stop Ollama, run index, verify error output)

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (setup) ──→ Phase 2 (utility) ──→ Phase 3 (US1) ──→ Phase 4 (US2) ──→ Phase 5 (US3) ──→ Phase 6 (polish)
```

- **Phase 1**: No dependencies — can start immediately
- **Phase 2**: Depends on Phase 1 (directory must exist)
- **Phase 3 (US1)**: Depends on Phase 2 (uses formatOllamaError utility)
- **Phase 4 (US2)**: Depends on Phase 2 (uses formatOllamaError for context); independent of Phase 3
- **Phase 5 (US3)**: Depends on Phase 2 (categorization logic); largely validates existing behavior
- **Phase 6**: Depends on ALL previous phases

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 (utility) — independent of US2 and US3
- **US2 (P2)**: Depends on Phase 2 (utility) — independent of US1 and US3
- **US3 (P3)**: Depends on Phase 2 (utility) — tests validate categorization already implemented in Phase 2

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD per constitution)
- Implementation tasks are sequential within their story
- Story complete when its test command passes

### Parallel Opportunities

- T003–T012 can all run in parallel (different test cases, same file)
- T018–T022 can all run in parallel (different test cases, same file)
- T028–T030 can all run in parallel (different test cases, different files)
- T035–T037 can all run in parallel (different test cases, same file)
- Phase 3 (US1) and Phase 4 (US2) can run in parallel (different packages/files)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (1 min)
2. Complete Phase 2: Utility (tests + implementation)
3. Complete Phase 3: US1 — enricher now shows full error details
4. **STOP and VALIDATE**: Test with `ollama stop && pnpm index --force`
5. This alone resolves the primary pain point (enricher discards response body)

### Incremental Delivery

1. Phase 1 + Phase 2 → Error utility ready
2. Phase 3 (US1) → Enrichment errors show full details → immediate value
3. Phase 4 (US2) → Embedding errors propagated → complete error visibility
4. Phase 5 (US3) → Actionable guidance → improved DX
5. Phase 6 → Full validation → ready for merge

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- TDD required: write tests first, verify they fail, then implement
- Commit after each phase completion
- US3 is mostly validation of Phase 2 implementation (categorization + suggestions are built into the utility from the start)
- The boundary between US1/US2/US3 is the _code path_ being fixed, not the utility logic
