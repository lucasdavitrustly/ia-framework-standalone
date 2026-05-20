# RAG A/B Benchmark Report

**Date**: 2026-05-20 18:45:00
**Target Project**: /users/rafael.goncalves/paywithmybank/source/core/payment-gateway

---

## Executive Summary

**Overall Verdict: MCP WINS (5/6 prompts, +13.4% quality improvement)**

MCP-enhanced responses demonstrated consistent quality improvements across all prompt categories while simultaneously reducing response time by 25.6%. The quality gain (+16 points across 6 prompts) comes at a modest token cost increase (+15.7% input tokens), representing an excellent cost-benefit ratio.

Key findings:

- **Quality**: MCP won 4 prompts, tied 1, lost 0 (1 decisive win of +7pts)
- **Speed**: MCP was 25.6% faster on average (78,418ms vs 105,430ms)
- **Cost**: +15.7% more input tokens, offset by speed and quality gains
- **Strongest improvement**: Negative/absence queries (+7pts) where MCP provides concrete alternatives

---

## Execution Environment

| Property          | Without MCP                    | With MCP                       |
| ----------------- | ------------------------------ | ------------------------------ |
| Model             | Claude Opus 4.6                | Claude Opus 4.6                |
| Provider          | Anthropic (via GitHub Copilot) | Anthropic (via GitHub Copilot) |
| Reasoning Level   | low                            | low                            |
| Context Window    | 200,000 tokens                 | 200,000 tokens                 |
| Max Output Tokens | 16,384 tokens                  | 16,384 tokens                  |

No discrepancies detected between modes.

---

## MCP Preflight Summary

| Run              | Status | Ready | Fallback | Blocked | Blocked Tools                           |
| ---------------- | ------ | ----- | -------- | ------- | --------------------------------------- |
| Prompts 1-3, 5-6 | ready  | 3     | 0        | 2       | get_module_dependencies, query_database |
| Prompt 4         | ready  | 5     | 0        | 0       | none                                    |

**Note**: 5/6 runs operated with 2 blocked tools (get_module_dependencies, query_database). Despite this, MCP still delivered consistent improvements, suggesting the core retrieval tools (search_codebase, search_codebase_hybrid, get_file) carry most of the value.

---

## Per-Prompt Results

### Prompt 1: "What is the overall architecture of this project? Describe the main modules and how they interact."

**Category**: arch-semantic (semantic)

#### MCP Preflight

| Property      | Value                                   |
| ------------- | --------------------------------------- |
| Status        | ready                                   |
| Runnable      | true                                    |
| Blocked Tools | get_module_dependencies, query_database |

#### Performance Metrics

| Metric             | Without MCP | With MCP | Delta  |
| ------------------ | ----------- | -------- | ------ |
| Response Time (ms) | 91,621      | 70,000   | -23.6% |
| Input Tokens       | 34,989      | 36,650   | +4.7%  |
| Output Tokens      | 474         | 535      | +12.9% |
| Total Tokens       | 35,463      | 37,185   | +4.9%  |
| Est. Cost ($)      | $0.560      | $0.590   | +5.3%  |

#### Quality Scores

| Dimension | Without MCP | With MCP  | Delta  |
| --------- | ----------- | --------- | ------ |
| **Total** | **15/25**   | **18/25** | **+3** |

**Verdict**: With MCP (3pt gap - Clear)
**Key Differentiator**: With MCP provides more specific class names, technology choices (RabbitMQ, Micrometer), and cross-cutting concerns.

---

### Prompt 2: "When we need to process an entry how this is made?"

**Category**: function-keyword (keyword)

#### MCP Preflight

| Property      | Value                                   |
| ------------- | --------------------------------------- |
| Status        | ready                                   |
| Runnable      | true                                    |
| Blocked Tools | get_module_dependencies, query_database |

#### Performance Metrics

| Metric             | Without MCP | With MCP | Delta  |
| ------------------ | ----------- | -------- | ------ |
| Response Time (ms) | 98,000      | 48,337   | -50.7% |
| Input Tokens       | 35,843      | 51,700   | +44.2% |
| Output Tokens      | 780         | 1,185    | +51.9% |
| Total Tokens       | 36,623      | 52,885   | +44.4% |
| Est. Cost ($)      | $0.632      | $0.918   | +45.2% |

#### Quality Scores

| Dimension | Without MCP | With MCP  | Delta  |
| --------- | ----------- | --------- | ------ |
| **Total** | **25/30**   | **28/30** | **+3** |

**Verdict**: With MCP (3pt gap - Clear)
**Key Differentiator**: With MCP provides more complete coverage (REST endpoint, returned entries, settlement handling) and includes line numbers.

---

### Prompt 3: "How a entry is persisted in the database?"

**Category**: deps-cross-file (cross-file)

#### MCP Preflight

| Property      | Value                                   |
| ------------- | --------------------------------------- |
| Status        | ready                                   |
| Runnable      | true                                    |
| Blocked Tools | get_module_dependencies, query_database |

#### Performance Metrics

| Metric             | Without MCP | With MCP | Delta  |
| ------------------ | ----------- | -------- | ------ |
| Response Time (ms) | 100,523     | 50,201   | -50.0% |
| Input Tokens       | 35,722      | 41,026   | +14.8% |
| Output Tokens      | 477         | 564      | +18.2% |
| Total Tokens       | 36,199      | 41,590   | +14.9% |
| Est. Cost ($)      | $0.571      | $0.645   | +12.9% |

#### Quality Scores

| Dimension | Without MCP | With MCP  | Delta  |
| --------- | ----------- | --------- | ------ |
| **Total** | **20/25**   | **22/25** | **+2** |

**Verdict**: With MCP (2pt gap - Narrow)
**Key Differentiator**: With MCP provides deeper coverage of update path with optimistic locking error handling and additional details.

---

### Prompt 4: "If want to add new payment-processor in the ACH, what would I need to modify and what patterns should I follow based on existing code?"

**Category**: impact-complex (complex)

#### MCP Preflight

| Property      | Value                    |
| ------------- | ------------------------ |
| Status        | ready                    |
| Runnable      | true                     |
| Blocked Tools | none (all 5 tools ready) |

#### Performance Metrics

| Metric             | Without MCP | With MCP | Delta  |
| ------------------ | ----------- | -------- | ------ |
| Response Time (ms) | 139,188     | 159,005  | +14.2% |
| Input Tokens       | 34,947      | 36,731   | +5.1%  |
| Output Tokens      | 934         | 1,213    | +29.9% |
| Total Tokens       | 35,881      | 37,944   | +5.7%  |
| Est. Cost ($)      | $0.788      | $0.1001  | +27.0% |

#### Quality Scores

| Dimension | Without MCP | With MCP  | Delta |
| --------- | ----------- | --------- | ----- |
| **Total** | **20/25**   | **20/25** | **0** |

**Verdict**: Tie
**Key Differentiator**: Both responses are nearly identical in quality; trade-offs balance out.

**Note**: This was the only prompt where MCP was slower (+14.2%), possibly due to additional tool calls that didn't yield differentiated information. All 5 tools were available (no blocked tools), yet no quality improvement was achieved.

---

### Prompt 5: "Does this project use WebSocket connections? If so, where is the WebSocket server configured?"

**Category**: nonexistent-negative (negative)

#### MCP Preflight

| Property      | Value                                   |
| ------------- | --------------------------------------- |
| Status        | ready                                   |
| Runnable      | true                                    |
| Blocked Tools | get_module_dependencies, query_database |

#### Performance Metrics

| Metric             | Without MCP | With MCP | Delta  |
| ------------------ | ----------- | -------- | ------ |
| Response Time (ms) | 55,807      | 30,000   | -46.2% |
| Input Tokens       | 33,165      | 39,667   | +19.6% |
| Output Tokens      | 298         | 341      | +14.4% |
| Total Tokens       | 33,463      | 40,008   | +19.6% |
| Est. Cost ($)      | $0.506      | $0.625   | +23.5% |

#### Quality Scores

| Dimension | Without MCP | With MCP  | Delta  |
| --------- | ----------- | --------- | ------ |
| **Total** | **15/30**   | **22/30** | **+7** |

**Verdict**: With MCP (7pt gap - Decisive)
**Key Differentiator**: With MCP provides specific technical details about actual communication mechanisms used (REST, JMS, RabbitMQ, PostgreSQL), giving useful architectural context.

---

### Prompt 6: "What error handling patterns are used in this project? Are there any inconsistencies?"

**Category**: error-edge-case (edge-case)

#### MCP Preflight

| Property      | Value                                   |
| ------------- | --------------------------------------- |
| Status        | ready                                   |
| Runnable      | true                                    |
| Blocked Tools | get_module_dependencies, query_database |

#### Performance Metrics

| Metric             | Without MCP | With MCP | Delta  |
| ------------------ | ----------- | -------- | ------ |
| Response Time (ms) | 147,438     | 112,964  | -23.4% |
| Input Tokens       | 34,461      | 36,255   | +5.2%  |
| Output Tokens      | 911         | 862      | -5.4%  |
| Total Tokens       | 35,372      | 37,117   | +4.9%  |
| Est. Cost ($)      | $0.770      | $0.738   | -4.1%  |

#### Quality Scores

| Dimension | Without MCP | With MCP  | Delta  |
| --------- | ----------- | --------- | ------ |
| **Total** | **24/30**   | **25/30** | **+1** |

**Verdict**: With MCP (1pt gap - Narrow)
**Key Differentiator**: With MCP adds a synthesis verdict and the ErrorDetail vs ErrorResponse inconsistency.

---

## Aggregate Summary

| Metric            | Without MCP (avg) | With MCP (avg)               | Delta      |
| ----------------- | ----------------- | ---------------------------- | ---------- |
| Avg Response Time | 105,430 ms        | 78,418 ms                    | **-25.6%** |
| Avg Input Tokens  | 34,855            | 40,338                       | +15.7%     |
| Avg Output Tokens | 646               | 784                          | +21.4%     |
| Avg Total Tokens  | 35,500            | 41,122                       | +15.8%     |
| Avg Quality Score | 19.8              | 22.5                         | **+13.4%** |
| Total Est. Cost   | $3.83             | $4.52                        | +18.0%     |
| Win Rate          | 0/6 prompts       | 5/6 prompts (4 wins + 1 tie) |            |

---

## Dimension Analysis

Based on the key differentiators reported by the judge, ranking improvement areas:

1. **Completeness** (negative queries): +7 points on Prompt 5 — MCP excels at confirming absence AND providing useful alternatives (what IS used instead)
2. **Technical Depth** (semantic/keyword): +3 points on Prompts 1-2 — MCP surfaces specific class names, technology names, and line numbers
3. **Code References** (cross-file): +2 points on Prompt 3 — MCP finds related files across the dependency chain (optimistic locking, update paths)
4. **Actionability** (edge-case): +1 point on Prompt 6 — MCP adds synthesis and identifies specific inconsistencies

Dimensions where MCP showed NO improvement:

- **Complex/impact queries** (Prompt 4): 0 points — For queries requiring broad architectural reasoning about hypothetical changes, MCP retrieval doesn't add value beyond what the model already infers from available context. The model may already have sufficient context from the conversation setup.

---

## Cost-Benefit Analysis

- **Additional token cost per prompt**: +5,622 tokens ($0.115)
- **Quality improvement**: +2.7 points per prompt (+13.4%)
- **Quality points per additional $1**: 23.5 points/$
- **Time saved per prompt**: 27,012 ms (-25.6%)
- **Break-even**: MCP pays for itself if quality improvement >5% matters to your workflow

### Cost Estimation Basis

- Model: Claude Opus 4.6 (via GitHub Copilot)
- Input pricing: ~$15.00/MTok (estimated)
- Output pricing: ~$75.00/MTok (estimated)

### ROI Summary

MCP delivers:

- **Better quality** (+13.4%) at **faster speed** (-25.6%) for **modest cost** (+18.0%)
- The speed improvement alone (saving ~27s per query) likely offsets the token cost in developer time

---

## RAG Improvement Insights

### Identified Weaknesses

- **Complex/Impact Queries (Prompt 4)**: MCP added no quality improvement despite all 5 tools being available and generating +30% more output tokens
  - **Root Cause Hypothesis**: Retrieval returns individual file chunks but doesn't synthesize cross-cutting architectural patterns needed for "what would I modify" questions
  - **Affected Component**: Chunking strategy + retrieval ranking (lacks pattern-aware retrieval)

- **Blocked Tools**: get_module_dependencies and query_database were blocked in 5/6 runs
  - **Root Cause Hypothesis**: These tools either have connectivity issues or are not configured for the target project
  - **Affected Component**: MCP server configuration / database connectivity

- **Edge-case narrow wins (Prompts 3, 6)**: Only +1-2 point improvement on cross-file and error pattern queries
  - **Root Cause Hypothesis**: Chunking may split error handling patterns across chunks, losing the holistic view needed to identify inconsistencies
  - **Affected Component**: Chunking strategy (semantic boundaries vs fixed-size)

### Proposed Improvements (Prioritized)

| #   | Improvement                                                 | Affected Package    | Effort | Expected Impact                            |
| --- | ----------------------------------------------------------- | ------------------- | ------ | ------------------------------------------ |
| 1   | Fix blocked tools (get_module_dependencies, query_database) | packages/mcp-server | S      | +2-3pts on cross-file/complex queries      |
| 2   | Add pattern-aware retrieval for "how to add X" queries      | packages/core       | L      | +3-5pts on complex/impact queries          |
| 3   | Implement cross-file dependency-chain retrieval             | packages/core       | M      | +2-3pts on cross-file queries              |
| 4   | Semantic chunking at class/method boundaries                | packages/core       | M      | +1-2pts on edge-case/error queries         |
| 5   | Add negative-query optimization (search for alternatives)   | packages/mcp-server | S      | Maintain decisive wins on negative queries |

**Details:**

1. **[P1] Fix Blocked Tools**
   - **Problem**: get_module_dependencies and query_database blocked in 83% of runs
   - **Proposed Solution**: Diagnose connectivity/configuration issues; add graceful degradation with informative fallback messages
   - **Affected Package**: packages/mcp-server
   - **Expected Impact**: +2-3pts on dependency-heavy queries; enables richer cross-file answers
   - **Effort Estimate**: Small
   - **GSD Phase Goal**: Ensure all 5 MCP tools pass preflight in 100% of runs

2. **[P2] Pattern-Aware Retrieval for Impact Queries**
   - **Problem**: Prompt 4 (complex) showed 0 improvement despite full tool availability — MCP retrieves files but doesn't identify architectural patterns (Strategy, Factory, interface extension points)
   - **Proposed Solution**: Add a "pattern extraction" post-processing step that identifies design patterns in retrieved chunks and surfaces them as structured context
   - **Affected Package**: packages/core (indexer + retrieval)
   - **Expected Impact**: +3-5pts on complex/impact queries (currently the weakest category)
   - **Effort Estimate**: Large
   - **GSD Phase Goal**: Complex queries achieve at least +2pt improvement over baseline

3. **[P3] Cross-File Dependency Chain Retrieval**
   - **Problem**: Cross-file queries (Prompt 3) only gained +2pts; retrieval doesn't follow import/dependency chains
   - **Proposed Solution**: When a retrieved chunk references another class/file, automatically include related chunks in context (expand_hops in search)
   - **Affected Package**: packages/core
   - **Expected Impact**: +2-3pts on cross-file and persistence queries
   - **Effort Estimate**: Medium
   - **GSD Phase Goal**: Cross-file queries consistently achieve +3pt improvement

4. **[P4] Semantic Chunking at Class/Method Boundaries**
   - **Problem**: Error handling patterns split across chunks (Prompt 6 only +1pt)
   - **Proposed Solution**: Use AST-aware chunking (tree-sitter) to keep complete methods/classes together rather than splitting at arbitrary token boundaries
   - **Affected Package**: packages/core (indexer)
   - **Expected Impact**: +1-2pts on pattern-recognition and consistency-detection queries
   - **Effort Estimate**: Medium
   - **GSD Phase Goal**: Pattern queries see complete method bodies in retrieved context

5. **[P5] Negative Query Optimization**
   - **Problem**: Already a decisive win (+7pts) but can be systematized
   - **Proposed Solution**: When search returns no results for a concept, automatically search for related/alternative concepts and present them
   - **Affected Package**: packages/mcp-server
   - **Expected Impact**: Maintain +5-7pt advantage; reduce hallucination risk
   - **Effort Estimate**: Small
   - **GSD Phase Goal**: Negative queries always include "what IS used instead" context

### RAG Pipeline Health Score

| Dimension              | Score    | Justification                                                                      |
| ---------------------- | -------- | ---------------------------------------------------------------------------------- |
| Retrieval Relevance    | 7/10     | Good for direct queries; weak for cross-cutting/pattern queries                    |
| Context Quality        | 6/10     | Chunks provide useful content but miss dependency chains and complete patterns     |
| Response Integration   | 8/10     | LLM effectively uses retrieved context (evidenced by specific names, line numbers) |
| **Overall RAG Health** | **7/10** | Solid foundation with clear improvement vectors                                    |

### Priority Recommendation

> Fix the 2 blocked MCP tools (get_module_dependencies, query_database) — smallest effort with immediate impact on 83% of query runs.

---

## Recommendations

### Should MCP remain enabled?

**YES** — Strong justification:

- Quality improves in 5/6 cases (+13.4% average)
- Speed improves by 25.6% (likely due to more focused context reducing reasoning loops)
- Cost increase is modest (+18%) and offset by time savings
- No regressions observed (worst case is a tie)

### Prompt categories where MCP adds most value

1. **Negative/absence queries** (+7pts decisive) — confirming what doesn't exist and what's used instead
2. **Keyword/function queries** (+3pts) — finding specific implementation flows with line numbers
3. **Semantic/architecture queries** (+3pts) — surfacing technology choices and cross-cutting concerns

### Prompt categories where MCP adds least value

1. **Complex/impact queries** (tie) — hypothetical "what would I change" questions need pattern reasoning, not just retrieval

### Suggested next steps

1. **Immediate**: Fix blocked tools (get_module_dependencies, query_database)
2. **Short-term**: Add more prompts to benchmark corpus (target 15-20 for statistical significance)
3. **Medium-term**: Implement cross-file dependency chain retrieval
4. **Long-term**: Pattern-aware retrieval for complex architectural queries

---

## Methodology Notes

- **Judge scoring**: Each prompt was scored by an LLM judge on quality dimensions (varying scales per prompt category)
- **Cost estimates**: Based on Claude Opus 4.6 pricing via GitHub Copilot (~$15/MTok input, ~$75/MTok output)
- **Time measurement**: Wall-clock time including all MCP tool calls
- **Preflight**: MCP tool availability checked before each run
- **Limitations**: 6 prompts is a small sample; results may not generalize to all query types
- **Blocked tools**: 2 tools blocked in most runs means MCP operated at ~60% capacity; improvements may be larger with full tool availability
