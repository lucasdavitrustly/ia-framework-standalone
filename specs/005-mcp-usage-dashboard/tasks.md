# Tasks: MCP Usage Dashboard

**Input**: Design documents from `specs/005-mcp-usage-dashboard/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included (TDD required by constitution — Principle I)

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `packages/<package>/src/` structure
- Key packages: `observability`, `mcp-server`, `dashboard-api`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema extension and shared types

- [x] T001 Add McpRequest type and RequestStore interface to packages/observability/src/types.ts
- [x] T002 Add mcp_requests table creation to MetricsStore constructor in packages/observability/src/metrics-store.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core storage layer that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests

- [x] T003 [P] Write failing test for `logRequest()` method in packages/observability/src/metrics-store.test.ts
- [x] T004 [P] Write failing test for `getRequestById()` method in packages/observability/src/metrics-store.test.ts
- [x] T005 [P] Write failing test for `listRequests()` with pagination in packages/observability/src/metrics-store.test.ts

### Implementation

- [x] T006 Implement `logRequest(request: McpRequest): void` in packages/observability/src/metrics-store.ts
- [x] T007 Implement `getRequestById(id: string): McpRequest | null` in packages/observability/src/metrics-store.ts
- [x] T008 Implement `listRequests(options: ListRequestsOptions): RequestsPage` in packages/observability/src/metrics-store.ts
- [x] T009 Export new types and methods from packages/observability/src/index.ts

**Checkpoint**: MetricsStore can persist and retrieve MCP requests. All tests green.

---

## Phase 3: User Story 1 - View All MCP Request Activity (Priority: P1) 🎯 MVP

**Goal**: Every MCP tool call is recorded with full context regardless of calling client.

**Independent Test**: Make any MCP tool call, then query `listRequests()` and confirm it appears with all fields populated.

### Tests for User Story 1

- [x] T010 [P] [US1] Write failing test for request-logger wrapper capturing tool input/output in packages/mcp-server/src/request-logger.test.ts
- [x] T011 [P] [US1] Write failing test for request-logger measuring duration in packages/mcp-server/src/request-logger.test.ts
- [x] T012 [P] [US1] Write failing test for request-logger silent failure on logging errors in packages/mcp-server/src/request-logger.test.ts

### Implementation for User Story 1

- [x] T013 [US1] Create request-logger wrapper function `withRequestLogging()` in packages/mcp-server/src/request-logger.ts
- [x] T014 [US1] Implement response content serialization (stringify tool results) in packages/mcp-server/src/request-logger.ts
- [x] T015 [US1] Implement truncation logic (512KB limit with marker) in packages/mcp-server/src/request-logger.ts
- [x] T016 [US1] Wire `withRequestLogging()` into `createMcpServer()` for all tool registrations in packages/mcp-server/src/server.ts
- [x] T017 [US1] Add McpServerConfig option for request logging (metricsStore dependency) in packages/mcp-server/src/server.ts

**Checkpoint**: All MCP tool calls are now recorded. Verify by running MCP server, making a tool call, and checking SQLite.

---

## Phase 4: User Story 2 - Track Token Usage Per Request (Priority: P1)

**Goal**: Each recorded request includes accurate input and output token counts.

**Independent Test**: Make a tool call, retrieve the request, verify `inputTokens` and `outputTokens` are non-zero and proportional to content size.

### Tests for User Story 2

- [x] T018 [P] [US2] Write failing test for input token counting (query + params) in packages/mcp-server/src/request-logger.test.ts
- [x] T019 [P] [US2] Write failing test for output token counting (response content) in packages/mcp-server/src/request-logger.test.ts

### Implementation for User Story 2

- [x] T020 [US2] Add TokenCounter usage to request-logger for input token calculation in packages/mcp-server/src/request-logger.ts
- [x] T021 [US2] Add TokenCounter usage to request-logger for output token calculation in packages/mcp-server/src/request-logger.ts
- [x] T022 [US2] Write failing test for `getRequestStats()` in packages/observability/src/metrics-store.test.ts
- [x] T023 [US2] Implement `getRequestStats(options?: DateRangeOptions): RequestSummaryStats` in packages/observability/src/metrics-store.ts

**Checkpoint**: Token usage is tracked per request and queryable in aggregate.

---

## Phase 5: User Story 3 - View Response Content (Priority: P2)

**Goal**: Full response content is retrievable for any recorded request via dashboard API.

**Independent Test**: Make a tool call, then GET `/api/requests/:id` and verify the full response body is returned.

### Tests for User Story 3

- [x] T024 [P] [US3] Write failing test for GET /api/requests listing in packages/dashboard-api/src/routes/requests.test.ts
- [x] T025 [P] [US3] Write failing test for GET /api/requests/:id detail in packages/dashboard-api/src/routes/requests.test.ts
- [x] T026 [P] [US3] Write failing test for GET /api/requests/stats in packages/dashboard-api/src/routes/requests.test.ts

### Implementation for User Story 3

- [x] T027 [P] [US3] Create requestsRouter with list endpoint in packages/dashboard-api/src/routes/requests.ts
- [x] T028 [US3] Add detail endpoint (by ID with full response content) in packages/dashboard-api/src/routes/requests.ts
- [x] T029 [US3] Add stats endpoint in packages/dashboard-api/src/routes/requests.ts
- [x] T030 [US3] Wire requestsRouter into app at /api/requests in packages/dashboard-api/src/app.ts

**Checkpoint**: Dashboard API exposes all request data. Verify with curl/browser.

---

## Phase 6: User Story 4 - Filter and Browse Request History (Priority: P3)

**Goal**: Users can filter requests by date range and tool name.

**Independent Test**: Record requests across different tools/dates, then use query params to filter and verify correct results.

### Tests for User Story 4

- [x] T031 [P] [US4] Write failing test for date range filtering in packages/dashboard-api/src/routes/requests.test.ts
- [x] T032 [P] [US4] Write failing test for tool_name filtering in packages/dashboard-api/src/routes/requests.test.ts

### Implementation for User Story 4

- [x] T033 [US4] Add `from`/`to` date range params to `listRequests()` in packages/observability/src/metrics-store.ts
- [x] T034 [US4] Add `toolName` filter param to `listRequests()` in packages/observability/src/metrics-store.ts
- [x] T035 [US4] Wire filter query params through in GET /api/requests in packages/dashboard-api/src/routes/requests.ts

**Checkpoint**: Filtering works end-to-end. All stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T036 [P] Add Zod validation for request query params in packages/dashboard-api/src/routes/requests.ts
- [x] T037 [P] Add SQLite indexes (timestamp, tool_name) to mcp_requests table in packages/observability/src/metrics-store.ts
- [x] T038 Run `pnpm build` and fix any type errors across all packages
- [x] T039 Run `pnpm test` and ensure all tests pass
- [ ] T040 Run quickstart.md validation (manual end-to-end test)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2
- **User Story 2 (Phase 4)**: Depends on Phase 3 (builds on request-logger)
- **User Story 3 (Phase 5)**: Depends on Phase 2 (only needs MetricsStore methods)
- **User Story 4 (Phase 6)**: Depends on Phase 5 (extends API routes)
- **Polish (Phase 7)**: Depends on all stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — core recording capability
- **US2 (P1)**: After US1 — extends request-logger with token counting
- **US3 (P2)**: After Foundational — can start in parallel with US1 (API routes only need store methods)
- **US4 (P3)**: After US3 — adds filtering to existing routes

### Parallel Opportunities

- T003, T004, T005 can run in parallel (independent test methods)
- T010, T011, T012 can run in parallel (independent test cases)
- T018, T019 can run in parallel
- T024, T025, T026 can run in parallel
- T031, T032 can run in parallel
- US1 and US3 can run in parallel (different packages, no shared files)

---

## Parallel Example: User Story 1

```bash
# Launch all tests together:
Task: "Write failing test for request-logger wrapper in packages/mcp-server/src/request-logger.test.ts"
Task: "Write failing test for duration measurement in packages/mcp-server/src/request-logger.test.ts"
Task: "Write failing test for silent failure in packages/mcp-server/src/request-logger.test.ts"
```

## Parallel Example: User Story 3

```bash
# Launch all API tests together:
Task: "Write failing test for GET /api/requests in packages/dashboard-api/src/routes/requests.test.ts"
Task: "Write failing test for GET /api/requests/:id in packages/dashboard-api/src/routes/requests.test.ts"
Task: "Write failing test for GET /api/requests/stats in packages/dashboard-api/src/routes/requests.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Setup (types + schema)
2. Complete Phase 2: Foundational (store methods)
3. Complete Phase 3: US1 (all tool calls recorded)
4. Complete Phase 4: US2 (token usage tracked)
5. **STOP and VALIDATE**: MCP server records all requests with tokens
6. Deploy — developers can now query SQLite directly

### Incremental Delivery

1. Setup + Foundational → Storage ready
2. US1 + US2 → Recording works (MVP!)
3. US3 → Dashboard API exposes data
4. US4 → Filtering and browsing
5. Each story adds access convenience without breaking recording

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Constitution requires TDD — all tests written before implementation
- Commit after each task or logical group
- Silent failure pattern: observability MUST NOT break tool responses
