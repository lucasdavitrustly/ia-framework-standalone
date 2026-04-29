# RAG Benchmark Report

## Executive Summary

- This benchmark compared **GPT 5.4 via GitHub Copilot** with and without the **ia-framework MCP server** across **6 prompts** using blind-judge scoring.
- **Overall result:** MCP did **not** improve the benchmark on aggregate. Average judge score fell from **8.17/25** to **7.67/25** (**-6.12%**), while estimated total cost rose from **$0.262** to **$0.290** (**+10.87%**).
- **Win rate:** Without MCP won **3/6** prompts, With MCP won **1/6**, and **2/6** were ties.
- The single clear MCP success was the **edge-case** prompt on error-handling patterns, where MCP improved quality from **18/25** to **20/25**.
- Benchmark validity is materially limited by **permission/tool-access failures**: **2/6 prompts** produced zero-token failed executions in one or both modes, and several other responses were mostly procedural rather than substantive.
- Most urgent conclusion: before deeper retrieval tuning, the RAG pipeline needs **reliable tool availability, graceful fallback behavior, and stronger evidence-grounded answer synthesis**.

## Execution Environment

| Property          | Without MCP            | With MCP               |
| ----------------- | ---------------------- | ---------------------- |
| Model             | github-copilot/gpt-5.4 | github-copilot/gpt-5.4 |
| Provider          | OpenAI                 | GitHub Copilot         |
| Reasoning Level   | medium                 | medium                 |
| Context Window    | unknown                | unknown                |
| Max Output Tokens | unknown                | unknown                |

**Potential issue**: Identity blocks were mostly missing, and the available identity blocks disagree on **Provider** (`OpenAI` vs `GitHub Copilot`). That inconsistency reduces benchmark reproducibility and may indicate executor-side identity reporting drift rather than a real model change.

## Prompt: "What is the overall architecture of this project? Describe the main modules and how they interact."

### Performance Metrics

| Metric             | Without MCP | With MCP | Delta   |
| ------------------ | ----------- | -------- | ------- |
| Response Time (ms) | 30538       | 28619    | -6.28%  |
| Input Tokens       | 16377       | 21597    | +31.87% |
| Output Tokens      | 778         | 878      | +12.85% |
| Total Tokens       | 17155       | 22475    | +31.01% |
| Est. Cost ($)      | $0.049      | $0.063   | +28.84% |

### Quality Scores (Judge Evaluation)

| Dimension         | Without MCP | With MCP | Delta  |
| ----------------- | ----------- | -------- | ------ |
| Factual Precision | 1/5         | 1/5      | +0     |
| Technical Depth   | 1/5         | 1/5      | +0     |
| Code References   | 1/5         | 1/5      | +0     |
| Completeness      | 1/5         | 1/5      | +0     |
| Actionability     | 1/5         | 1/5      | +0     |
| **Total**         | **5/25**    | **5/25** | **+0** |

**Verdict**: Tie (tie)
**Key Differentiator**: Both responses are equally poor because neither actually answers the architecture question and both appear to misidentify the project at a fundamental level.

## Prompt: "Where is the main entry point of the application defined? Show me the exact file and function."

### Performance Metrics

| Metric             | Without MCP | With MCP | Delta |
| ------------------ | ----------- | -------- | ----- |
| Response Time (ms) | 0           | 0        | N/A   |
| Input Tokens       | 0           | 0        | N/A   |
| Output Tokens      | 0           | 0        | N/A   |
| Total Tokens       | 0           | 0        | N/A   |
| Est. Cost ($)      | $0.000      | $0.000   | N/A   |

### Quality Scores (Judge Evaluation)

| Dimension         | Without MCP | With MCP | Delta  |
| ----------------- | ----------- | -------- | ------ |
| Factual Precision | 2/5         | 1/5      | -1     |
| Technical Depth   | 1/5         | 1/5      | +0     |
| Code References   | 2/5         | 1/5      | -1     |
| Completeness      | 1/5         | 1/5      | +0     |
| Actionability     | 1/5         | 1/5      | +0     |
| **Total**         | **7/25**    | **5/25** | **-2** |

**Verdict**: Without MCP (narrow)
**Key Differentiator**: The without-MCP response is still a failed response, but it at least surfaced specific candidate file paths, whereas the with-MCP response provided only a rejected tool invocation with no substantive answer.

**Validity Note**: This prompt is benchmark-limited. Both modes failed due to permission/tool-access rejection, so the quality result mainly reflects failure behavior, not true retrieval quality.

## Prompt: "How do the database models relate to the API routes? Trace the data flow from request to database."

### Performance Metrics

| Metric             | Without MCP | With MCP | Delta |
| ------------------ | ----------- | -------- | ----- |
| Response Time (ms) | 0           | 0        | N/A   |
| Input Tokens       | 0           | 0        | N/A   |
| Output Tokens      | 0           | 0        | N/A   |
| Total Tokens       | 0           | 0        | N/A   |
| Est. Cost ($)      | $0.000      | $0.000   | N/A   |

### Quality Scores (Judge Evaluation)

| Dimension         | Without MCP | With MCP | Delta  |
| ----------------- | ----------- | -------- | ------ |
| Factual Precision | 1/5         | 1/5      | +0     |
| Technical Depth   | 1/5         | 1/5      | +0     |
| Code References   | 1/5         | 1/5      | +0     |
| Completeness      | 1/5         | 1/5      | +0     |
| Actionability     | 1/5         | 1/5      | +0     |
| **Total**         | **5/25**    | **5/25** | **+0** |

**Verdict**: Tie (tie)
**Key Differentiator**: There is no meaningful differentiator because both responses failed identically with the same permission-rejection error and provided no substantive answer.

**Validity Note**: This prompt is not a valid retrieval comparison because both modes failed identically before any useful codebase evidence was incorporated.

## Prompt: "If I wanted to add a new API endpoint that requires authentication, what files would I need to modify and what patterns should I follow based on existing code?"

### Performance Metrics

| Metric             | Without MCP | With MCP | Delta   |
| ------------------ | ----------- | -------- | ------- |
| Response Time (ms) | 71679       | 28565    | -60.15% |
| Input Tokens       | 12035       | 12490    | +3.78%  |
| Output Tokens      | 484         | 461      | -4.75%  |
| Total Tokens       | 12519       | 12951    | +3.45%  |
| Est. Cost ($)      | $0.035      | $0.036   | +2.60%  |

### Quality Scores (Judge Evaluation)

| Dimension         | Without MCP | With MCP | Delta  |
| ----------------- | ----------- | -------- | ------ |
| Factual Precision | 2/5         | 2/5      | +0     |
| Technical Depth   | 2/5         | 1/5      | -1     |
| Code References   | 2/5         | 1/5      | -1     |
| Completeness      | 1/5         | 1/5      | +0     |
| Actionability     | 1/5         | 1/5      | +0     |
| **Total**         | **8/25**    | **6/25** | **-2** |

**Verdict**: Without MCP (narrow)
**Key Differentiator**: The without-MCP response is still incomplete, but it at least points to plausible extension points (`SecurityConfig`, controllers, integration tests), whereas the with-MCP response remains entirely procedural and non-substantive.

## Prompt: "Does this project use WebSocket connections? If so, where is the WebSocket server configured?"

### Performance Metrics

| Metric             | Without MCP | With MCP | Delta   |
| ------------------ | ----------- | -------- | ------- |
| Response Time (ms) | 34201       | 23700    | -30.70% |
| Input Tokens       | 16408       | 11454    | -30.19% |
| Output Tokens      | 963         | 368      | -61.79% |
| Total Tokens       | 17371       | 11822    | -31.94% |
| Est. Cost ($)      | $0.051      | $0.032   | -36.20% |

### Quality Scores (Judge Evaluation)

| Dimension         | Without MCP | With MCP | Delta  |
| ----------------- | ----------- | -------- | ------ |
| Factual Precision | 2/5         | 1/5      | -1     |
| Technical Depth   | 1/5         | 1/5      | +0     |
| Code References   | 1/5         | 1/5      | +0     |
| Completeness      | 1/5         | 1/5      | +0     |
| Actionability     | 1/5         | 1/5      | +0     |
| **Total**         | **6/25**    | **5/25** | **-1** |

**Verdict**: Without MCP (narrow)
**Key Differentiator**: Both responses fail to answer the prompt and are mostly procedural, but the without-MCP response is slightly better because it at least includes a tentative finding ('no WebSocket-specific code') rather than only stating that it is checking.

## Prompt: "What error handling patterns are used in this project? Are there any inconsistencies?"

### Performance Metrics

| Metric             | Without MCP | With MCP | Delta   |
| ------------------ | ----------- | -------- | ------- |
| Response Time (ms) | 59465       | 110890   | +86.47% |
| Input Tokens       | 39842       | 42833    | +7.51%  |
| Output Tokens      | 2767        | 5200     | +87.93% |
| Total Tokens       | 42609       | 48033    | +12.73% |
| Est. Cost ($)      | $0.127      | $0.159   | +24.99% |

### Quality Scores (Judge Evaluation)

| Dimension         | Without MCP | With MCP  | Delta  |
| ----------------- | ----------- | --------- | ------ |
| Factual Precision | 3/5         | 4/5       | +1     |
| Technical Depth   | 4/5         | 4/5       | +0     |
| Code References   | 4/5         | 4/5       | +0     |
| Completeness      | 4/5         | 4/5       | +0     |
| Actionability     | 3/5         | 4/5       | +1     |
| **Total**         | **18/25**   | **20/25** | **+2** |

**Verdict**: With MCP (narrow)
**Key Differentiator**: The with-MCP response does a better job connecting exception taxonomy to externally visible behavior, especially around HTTP payload consistency, fallback semantics, and hierarchy enforcement.

## Aggregate Summary

| Metric            | Without MCP (avg) | With MCP (avg) | Delta   |
| ----------------- | ----------------- | -------------- | ------- |
| Avg Response Time | 32647.17 ms       | 31962.33 ms    | -2.10%  |
| Avg Input Tokens  | 14110.33          | 14729.00       | +4.38%  |
| Avg Output Tokens | 832.00            | 1151.17        | +38.36% |
| Avg Quality Score | 8.17/25           | 7.67/25        | -6.12%  |
| Total Est. Cost   | $0.262            | $0.290         | +10.87% |
| Win Rate          | 3/6 prompts       | 1/6 prompts    |         |

**Validity limitation**: The aggregate is materially distorted by permission/tool-access failures on the `keyword` and `cross-file` prompts. There were also only **4/6 prompts** with non-zero execution metrics and only **1/6 prompts** where MCP clearly improved answer quality. Treat the aggregate as a diagnostic snapshot, not a definitive production-readiness score.

## Dimension Analysis

Rank the 5 quality dimensions by improvement (delta):

1. Actionability: +1 points (+12.50%) — MCP helped most when it connected code findings to externally visible behavior and offered a clearer next-step framing on the successful edge-case prompt.
2. Completeness: +0 points (+0.00%) — MCP did not improve end-to-end coverage; responses were usually still partial or procedural.
3. Factual Precision: -1 points (-9.09%) — MCP often failed to ground claims in retrieved evidence, including one architecture misread and one weaker negative-answer response.
4. Technical Depth: -1 points (-10.00%) — MCP frequently stopped at “inspecting/checking” language instead of synthesizing cross-file technical conclusions.
5. Code References: -2 points (-18.18%) — MCP underperformed most on exact file/function anchoring, especially when tool access was rejected or retrieval returned no anchored snippets.

Dimensions where MCP showed NO improvement or regression:

- Completeness: No net gain; MCP rarely converted retrieved context into full answers for architecture, cross-file, or implementation-change prompts.
- Factual Precision: Regressed because retrieval either failed outright or did not prevent weak, non-evidence-backed statements.
- Technical Depth: Regressed because answers often remained procedural rather than analytical.
- Code References: Regressed most because MCP did not reliably surface exact file/function/line anchors outside the one strong prompt.

## Cost-Benefit Analysis

- **Additional token cost per prompt**: +937.83 tokens ($0.005)
- **Quality improvement**: -0.50 points (-6.12%)
- **Quality points per additional $1**: -105.52 points/$
- **Break-even**: MCP would need to deliver roughly >10.87% quality improvement at the current cost profile to justify the extra spend; this benchmark delivered -6.12%

### Cost Estimation Basis

- Model: github-copilot/gpt-5.4
- Input pricing: ~$2.50/MTok (estimated)
- Output pricing: ~$10.00/MTok (estimated)

## RAG Improvement Insights

### Identified Weaknesses

For each quality dimension where MCP scored < 4/5 or showed < +1 improvement:

- **Factual Precision**: MCP responses often remained tentative or incorrect at the project-structure level, including a likely architecture misidentification.
  - **Root Cause Hypothesis**: Retrieval either failed before returning evidence or returned weak top-k context without enough repository-shape grounding.
  - **Affected Component**: retrieval, MCP tool, answer synthesis
- **Technical Depth**: MCP frequently narrated its search process instead of producing a synthesized technical explanation.
  - **Root Cause Hypothesis**: The response layer lacks a minimum-evidence-to-answer policy and does not force multi-hop synthesis after retrieval.
  - **Affected Component**: retrieval orchestration, MCP tool, response integration
- **Code References**: Exact files, functions, and line-level anchors were inconsistent or absent in most MCP answers.
  - **Root Cause Hypothesis**: Search outputs are not consistently returning symbol-aware snippets with reliable line metadata for direct citation.
  - **Affected Component**: indexer, chunking, retrieval, MCP tool
- **Completeness**: Cross-file and implementation-change prompts were not answered end-to-end even when the task required tracing or modification guidance.
  - **Root Cause Hypothesis**: The pipeline is weak at multi-hop retrieval/reranking and may not expand across module boundaries in Java multi-module projects.
  - **Affected Component**: indexer, retrieval, re-ranking
- **Actionability**: MCP showed only a narrow gain, mostly on the final successful prompt.
  - **Root Cause Hypothesis**: Retrieved context is not structured into change-oriented patterns such as “files to edit,” “existing examples,” or “steps to follow.”
  - **Affected Component**: chunking, retrieval formatting, MCP tool

### Proposed Improvements

Ordered by expected impact (highest first):

1. **Add permission-aware fallback and benchmark preflight checks**
   - **Problem**: Two prompts failed because required reads/tools were rejected, and MCP degraded to empty procedural output.
   - **Proposed Solution**: Add a preflight step that verifies required MCP tools are callable before benchmark execution, and implement graceful fallback behavior that returns the best available indexed evidence instead of a rejected-tool stub.
   - **Affected Package**: packages/mcp-server, packages/benchmark
   - **Expected Impact**: Improve Factual Precision, Code References, and Completeness by preventing zero-evidence failures; likely +2 to +5 total points on currently failing prompts.
   - **Effort Estimate**: medium (M)

2. **Introduce symbol-aware hybrid retrieval with re-ranking for Java multi-module repos**
   - **Problem**: MCP underperformed on exact entry-point lookup, architecture mapping, and route-to-model tracing.
   - **Proposed Solution**: Combine lexical identifier search, semantic retrieval, and structural metadata from Maven modules/package names; then re-rank results toward entry points, controllers, repositories, configs, and exception handlers.
   - **Affected Package**: packages/core, packages/mcp-server
   - **Expected Impact**: Improve Factual Precision, Technical Depth, and Code References by making top-k evidence more repository-aware; likely +1 to +3 points on semantic, keyword, and cross-file prompts.
   - **Effort Estimate**: medium (M)

3. **Emit richer code anchors in MCP search responses**
   - **Problem**: Even when MCP likely found relevant material, answers often lacked exact file/function/line citations.
   - **Proposed Solution**: Return file path, symbol name, line ranges, and short evidence snippets as first-class fields from search/get-file tools so the model can cite them directly.
   - **Affected Package**: packages/core, packages/mcp-server
   - **Expected Impact**: Improve Code References and Actionability; likely +1 to +2 points on prompts asking for exact files or extension points.
   - **Effort Estimate**: small (S)

4. **Add response-quality guardrails to suppress procedural non-answers**
   - **Problem**: Several MCP responses merely said they were “checking” or “inspecting” rather than answering.
   - **Proposed Solution**: Add answer-generation guardrails that require a final response to contain at least one direct conclusion plus cited evidence, or else explicitly state insufficient evidence with the highest-confidence findings gathered so far.
   - **Affected Package**: packages/mcp-server
   - **Expected Impact**: Improve Completeness and Technical Depth by converting search narration into usable conclusions; likely +1 to +2 points across multiple categories.
   - **Effort Estimate**: small (S)

5. **Make chunking and graph expansion module-aware for architecture and data-flow questions**
   - **Problem**: MCP struggled on architecture and request-to-database tracing, which likely require crossing module, package, and layer boundaries.
   - **Proposed Solution**: Add module-aware chunk metadata, cross-file dependency expansion, and query templates tuned for controller -> service -> repository/model flows in Java/Spring projects.
   - **Affected Package**: packages/core
   - **Expected Impact**: Improve Completeness and Technical Depth on semantic and cross-file prompts; likely +2 to +4 points on those categories.
   - **Effort Estimate**: large (L)

### RAG Pipeline Health Score

Based on benchmark results, rate the current RAG pipeline:

- **Retrieval Relevance**: 3/10 — Relevant evidence was surfaced reliably on only one prompt, while multiple other prompts failed or stayed too generic.
- **Context Quality**: 3/10 — Retrieved context was often too weak, too sparse, or too poorly anchored to support exact answers.
- **Response Integration**: 2/10 — The dominant failure mode was procedural narration instead of evidence-backed synthesis.
- **Overall RAG Health**: 3/10

### Priority Recommendation

> Implement permission-aware fallback plus benchmark preflight checks first, because the current benchmark is being dominated by preventable tool-access failures rather than true retrieval quality.

- **Affected Package/Component**: packages/mcp-server, packages/benchmark
- **Rationale**: Until MCP can reliably access or gracefully degrade around required tools, the benchmark will continue to measure execution failure behavior more than RAG quality.
- **Proposed Solution**: Before each run, validate MCP tool availability and permissions, then route failed calls to an indexed fallback path that still returns file/symbol evidence instead of a blank rejection artifact.

## Recommendations

### Should MCP remain enabled?

NO for this benchmark configuration. The measured MCP setup increased cost and token usage while reducing average quality, and only one prompt showed a meaningful upside. Re-enable by default only after tool-access reliability and retrieval grounding are improved.

### Prompt categories where MCP adds most value

In this sample, MCP added value only on the **edge-case** prompt about error-handling inconsistencies. It did not add value on **semantic**, **keyword**, **cross-file**, **complex**, or **negative** prompts.

### Potential RAG pipeline improvements

Prioritize tool-access resilience, symbol-aware hybrid retrieval, richer citation anchors, and guardrails that force evidence-backed conclusions instead of procedural narration.

### Suggested next steps

1. Fix permission handling and add benchmark preflight validation.
2. Improve Java/Spring retrieval with symbol-aware hybrid search and re-ranking.
3. Add first-class file/symbol/line anchors to MCP tool outputs.
4. Re-run the same corpus after the above fixes to confirm whether failed prompts convert into substantive answers.
5. Add a second benchmark pass focused on architecture and cross-file tracing once module-aware expansion is implemented.
