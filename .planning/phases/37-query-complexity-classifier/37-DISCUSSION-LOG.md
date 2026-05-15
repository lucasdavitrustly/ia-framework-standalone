# Phase 37: Query Complexity Classifier - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 37-query-complexity-classifier
**Areas discussed:** Classification rules & signals, Routing behavior & tool selection, Integration point in MCP pipeline

---

## Classification Rules & Signals

### Q1: How should the classifier determine if a query is a keyword/symbol lookup?

| Option                                 | Description                                                                                                             | Selected |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| Pattern-based heuristics (Recommended) | PascalCase/camelCase symbols, quoted strings, 'find/where/locate' verbs, short queries (<8 words). Fast, deterministic. | ✓        |
| Symbol table lookup                    | Maintain a list of known class/method names from the index. Match query terms against it.                               |          |
| Weighted multi-signal scoring          | Score multiple signals (length, symbol presence, verb type) and threshold. More nuanced but more complex.               |          |

**User's choice:** Pattern-based heuristics
**Notes:** None

### Q2: Should the classifier output be binary or have a middle ground?

| Option                       | Description                                                        | Selected |
| ---------------------------- | ------------------------------------------------------------------ | -------- |
| Two categories (Recommended) | keyword (skip RAG) vs semantic (full RAG). Simple binary.          | ✓        |
| Three categories             | keyword, semantic, and hybrid (use both). Covers borderline cases. |          |

**User's choice:** Two categories (binary)
**Notes:** None

### Q3: Should the classifier reuse analyzeRetrievalQuery() or be a new module?

| Option                                | Description                                                                                                       | Selected |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| New module (Recommended)              | Build fresh in packages/mcp-server alongside detectIntent(). Clean separation of concerns.                        | ✓        |
| Extend existing analyzeRetrievalQuery | Extend analyzeRetrievalQuery() in packages/retrieval to also return queryType. Reuses existing symbol extraction. |          |

**User's choice:** New module
**Notes:** None

### Q4: Handle QCC-05 (configurable rules) now or defer?

| Option                                | Description                                                                 | Selected |
| ------------------------------------- | --------------------------------------------------------------------------- | -------- |
| Configurable rules via project config | Rules in project.json config. Users can tune without code changes (QCC-05). | ✓        |
| Hardcoded rules (Recommended)         | Hardcoded patterns in code. Change requires a code deploy, but simpler.     |          |

**User's choice:** Configurable rules via project config
**Notes:** User chose against the recommended option — wants configurability from the start.

---

## Routing Behavior & Tool Selection

### Q1: When classified as keyword, what should the actual lookup mechanism be?

| Option                                  | Description                                                                                                                     | Selected |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Reuse existing tools (Recommended)      | Use existing getFile() for exact paths, and searchKeyword() (BM25 sparse search from Phase 23) for symbol names. Already built. | ✓        |
| Direct filesystem grep                  | Shell out to grep/ripgrep on the actual filesystem for symbol searches. Fast but no ranking.                                    |          |
| New symbol-specific Qdrant filter query | New purpose-built lightweight search (Qdrant payload filter on symbolName field). Precise but new code.                         |          |

**User's choice:** Reuse existing tools
**Notes:** None

### Q2: If keyword route returns nothing, should it fall back to semantic?

| Option                              | Description                                                                    | Selected |
| ----------------------------------- | ------------------------------------------------------------------------------ | -------- |
| Fall back to semantic (Recommended) | If keyword search returns 0 results, fall back to semantic search. Safety net. | ✓        |
| No fallback — trust the classifier  | Trust the classification. Return empty/not-found if keyword search misses.     |          |

**User's choice:** Fall back to semantic
**Notes:** None

### Q3: Should keyword-routed responses look identical to semantic responses?

| Option                                  | Description                                                                                                 | Selected |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------- |
| Transparent — same format (Recommended) | Same format as semantic results — code chunks with metadata. LLM doesn't know the routing changed.          | ✓        |
| Annotated — include routing metadata    | Include a metadata flag like 'classification: keyword, route: direct' so the LLM can adjust response style. |          |

**User's choice:** Transparent — same format
**Notes:** None

---

## Integration Point in MCP Pipeline

### Q1: Where should classification logic sit relative to the existing handler?

| Option                                | Description                                                                                                                                                       | Selected |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Inside existing handler (Recommended) | Classification runs at the top of searchCodebaseHandler(), before calling engine.search\*(). Keyword queries take an alternate code path within the same handler. | ✓        |
| Pre-handler middleware                | A middleware function wraps the handler. Classification happens before the handler runs, injecting a 'route' into the context.                                    |          |

**User's choice:** Inside existing handler
**Notes:** None

### Q2: Should the classifier also apply to search_codebase_hybrid?

| Option                   | Description                                                                                | Selected |
| ------------------------ | ------------------------------------------------------------------------------------------ | -------- |
| Both tools (Recommended) | Both tools classify and route. Consistent behavior regardless of which tool the LLM picks. | ✓        |
| Only search_codebase     | Only search_codebase. Hybrid tool already has keyword component built in.                  |          |

**User's choice:** Both tools
**Notes:** None

### Q3: When keyword-routed, should the response still go through threshold/token cap?

| Option                                                       | Description                                                                                          | Selected |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------- |
| Skip — keyword results are inherently targeted (Recommended) | Keyword route skips threshold/token cap (results are already targeted). Goes straight to formatting. | ✓        |
| Apply — keep pipeline consistent                             | Still apply both. Consistent pipeline regardless of route.                                           |          |

**User's choice:** Skip
**Notes:** None

### Q4: How should classification decisions be logged?

| Option                       | Description                                                                                             | Selected |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| Structured log (Recommended) | Structured log entry with query, classification, confidence, route taken, latency. Feeds observability. | ✓        |
| Response metadata only       | Add to structuredContent metadata in the MCP response (alongside intent_detected, fallback_used).       |          |

**User's choice:** Structured log
**Notes:** None

---

## Agent's Discretion

- Exact regex patterns for symbol detection
- Specific verb lists for lookup detection
- Config schema shape for classification rules
- Test fixture design

## Deferred Ideas

None — discussion stayed within phase scope.
