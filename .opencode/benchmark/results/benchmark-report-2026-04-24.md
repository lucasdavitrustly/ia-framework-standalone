# RAG Benchmark Comparison Report

**Date**: 2026-04-24  
**Target Project**: `/users/rafael.goncalves/paywithmybank/source/core/payment-gateway`  
**Stack**: Java/Spring Boot multi-module Maven monorepo — payment gateway  
**Corpus**: 6 prompts across categories: semantic, keyword, cross-file, complex, negative, edge-case  
**Reporter**: Benchmark Reporter (claude-sonnet-4.6 via github-copilot/claude-sonnet-4.6)

---

> ⚠️ **Data Quality Flag — Model Identity Inconsistency**  
> The benchmark was configured to use `github-copilot/gpt-5.4` (GPT 5.4), but Prompts 3, 4 (deps-cross-file, impact-complex) were executed with **Claude Sonnet 4.6** (claude-sonnet-4-6, 200K context, 8,096 max output). This means cross-prompt comparisons for those prompts are not apples-to-apples. Affected metrics are flagged inline. A clean re-run with a consistent model is recommended before drawing final conclusions from those two prompts.

---

## Execution Environment

| Property                              | Without MCP                             | With MCP                                |
| ------------------------------------- | --------------------------------------- | --------------------------------------- |
| Model (Prompts 1, 2, 5, 6)            | GPT-4o (`gpt-4o`)                       | GPT-4o (`gpt-4o`)                       |
| Model (Prompts 3, 4) ⚠️               | Claude Sonnet 4.6 (`claude-sonnet-4-6`) | Claude Sonnet 4.6 (`claude-sonnet-4-6`) |
| Provider                              | OpenAI / GitHub Copilot                 | OpenAI / GitHub Copilot                 |
| Reasoning Level                       | none                                    | none                                    |
| Context Window (GPT-4o)               | 128,000 tokens                          | 128,000 tokens                          |
| Context Window (Claude Sonnet 4.6)    | 200,000 tokens                          | 200,000 tokens                          |
| Max Output Tokens (GPT-4o)            | 16,384                                  | 16,384                                  |
| Max Output Tokens (Claude Sonnet 4.6) | 8,096                                   | 8,096                                   |

> ⚠️ **Flag**: The model identity is consistent _within_ each prompt (same model used for both modes per prompt), but **differs across prompts**. This is a benchmark executor misconfiguration. GPT 5.4 was never observed — the actual models were GPT-4o and Claude Sonnet 4.6. Cost estimates use GPT-4o pricing ($2.50/MTok input, $10/MTok output) for all prompts as a conservative approximation; Claude Sonnet 4.6 is priced differently (approximately $3.00/MTok input, $15/MTok output via Anthropic), which would increase the cost estimates for Prompts 3 and 4. This report uses GPT-4o pricing throughout for consistency, with a note where Claude pricing would apply.

---

## Per-Prompt Results

---

### Prompt 1: `arch-semantic`

**Prompt**: _"Explain the overall architecture of this payment gateway system. How are the modules organized and what are the main responsibilities of each?"_

#### MCP Preflight

| Property       | Value                                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| Status         | ✅ ready                                                                       |
| Runnable       | true                                                                           |
| Summary        | All 3 tools available: `search_codebase`, `search_codebase_hybrid`, `get_file` |
| Blocked Tools  | none                                                                           |
| Fallback Tools | none                                                                           |

#### Performance Metrics

| Metric             | Without MCP | With MCP | Delta         |
| ------------------ | ----------- | -------- | ------------- |
| Response Time (ms) | 104,878     | 93,550   | **-10.8%** ✅ |
| Input Tokens       | 50,271      | 43,723   | -13.0% ✅     |
| Output Tokens      | 4,738       | 5,073    | +7.1%         |
| Total Tokens       | 55,009      | 48,796   | -11.3% ✅     |
| Est. Cost ($)      | $0.1731     | $0.1600  | **-7.5%** ✅  |

> **Cost basis**: Input @ $2.50/MTok, Output @ $10.00/MTok (GPT-4o via GitHub Copilot — approximate)

#### Quality Scores (Judge Evaluation)

| Dimension         | Without MCP | With MCP  | Delta  |
| ----------------- | ----------- | --------- | ------ |
| Factual Precision | 4/5         | 4/5       | 0      |
| Technical Depth   | 5/5         | 4/5       | **-1** |
| Code References   | 5/5         | 4/5       | **-1** |
| Completeness      | 5/5         | 4/5       | **-1** |
| Actionability     | 4/5         | 3/5       | **-1** |
| **Total**         | **23/25**   | **19/25** | **-4** |

**Verdict**: ❌ WITHOUT MCP wins (margin: 4 points)  
**Key Differentiator**: The WITHOUT-MCP response was more narratively organized and polished, achieving high scores on technical depth and completeness through well-structured general Spring Boot architectural knowledge. The WITH-MCP response, while citing real classes (`PaymentGatewayApplication`, `PaymentProcessor`, `AchPaymentAdapter`, `FifthThirdRtpAdapter`) and actual package paths, was slightly less coherent in presentation. MCP tool calls returned partial results, reducing the structured narrative quality that the judge rewarded. **This is a classic RAG trade-off**: factual grounding vs. response organization — the judge penalized disorganization more than hallucination risk in this case.

---

### Prompt 2: `function-keyword`

**Prompt**: _"Find all usages of the `processPayment` function across the codebase."_

#### MCP Preflight

| Property       | Value                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| Status         | 🚫 blocked                                                                |
| Runnable       | false (preflight tool rejected by opencode permission system)             |
| Summary        | `ia-framework_benchmark_preflight` rejected by opencode permission system |
| Blocked Tools  | `ia-framework_benchmark_preflight`                                        |
| Fallback Tools | none detected by preflight                                                |

> ⚠️ **Note**: Despite the blocked preflight, the WITH-MCP execution **succeeded** in calling `search_codebase_hybrid` directly. The block was isolated to the preflight probe tool, not to the MCP retrieval tools themselves. The WITH-MCP response was therefore executed under degraded preflight coverage but with **functional MCP tools**. This is an important distinction — preflight blocking does not equal MCP blocking.

#### Performance Metrics

| Metric             | Without MCP | With MCP | Delta         |
| ------------------ | ----------- | -------- | ------------- |
| Response Time (ms) | 24,176      | 10,516   | **-56.5%** ✅ |
| Input Tokens       | 7,325       | 7,325    | 0%            |
| Output Tokens      | 312         | 312      | 0%            |
| Total Tokens       | 7,637       | 7,637    | 0%            |
| Est. Cost ($)      | $0.0214     | $0.0214  | 0%            |

> **Note**: Identical token counts between modes suggest the WITH-MCP run's retrieval context was injected differently (possibly as tool results not counted in this token snapshot) or the aggregate table reflects a pre-retrieval snapshot.

#### Quality Scores (Judge Evaluation)

| Dimension         | Without MCP | With MCP  | Delta   |
| ----------------- | ----------- | --------- | ------- |
| Factual Precision | 1/5         | 3/5       | **+2**  |
| Technical Depth   | 1/5         | 3/5       | **+2**  |
| Code References   | 1/5         | 4/5       | **+3**  |
| Completeness      | 1/5         | 3/5       | **+2**  |
| Actionability     | 1/5         | 3/5       | **+2**  |
| **Total**         | **5/25**    | **16/25** | **+11** |

**Verdict**: ✅ WITH MCP wins (margin: 11 points — largest single-prompt improvement)  
**Key Differentiator**: This is the clearest demonstration of MCP value. Without MCP, the response was completely unable to locate any usages and resorted to generic explanation. With MCP, `search_codebase_hybrid` returned **8 actual call sites across 5 real files** (`PaymentService.java`, `PaymentProcessor.java`, `AchPaymentAdapter.java`, `FifthThirdRtpAdapter.java`, `PaymentGatewayController.java`) with exact line numbers and method signatures. Keyword/symbol lookup is the highest-ROI use case for RAG retrieval.

---

### Prompt 3: `deps-cross-file`

**Prompt**: _"What are the dependencies between `payment-gateway-core` and `payment-gateway-processor`? Show how data flows between these two modules."_

> ⚠️ **Model Identity Flag**: This prompt was executed with **Claude Sonnet 4.6** (200K context), not GPT-4o/GPT 5.4 as configured. Performance and quality results for this prompt should not be directly compared with Prompts 1, 2, 5, 6.

#### MCP Preflight

| Property       | Value                                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| Status         | ✅ ready                                                                       |
| Runnable       | true                                                                           |
| Summary        | All 3 tools available: `search_codebase`, `search_codebase_hybrid`, `get_file` |
| Blocked Tools  | none                                                                           |
| Fallback Tools | none                                                                           |

#### Performance Metrics

| Metric             | Without MCP | With MCP | Delta         |
| ------------------ | ----------- | -------- | ------------- |
| Response Time (ms) | 129,000     | 44,000   | **-65.9%** ✅ |
| Input Tokens       | 32,974      | 43,137   | +30.8%        |
| Output Tokens      | 1,209       | 1,413    | +16.9%        |
| Total Tokens       | 34,183      | 44,550   | +30.3%        |
| Est. Cost ($)      | $0.0945     | $0.1220  | **+29.0%**    |

> **Note**: The 65.9% response time reduction is striking given the token count increased. Claude Sonnet 4.6's generation speed combined with RAG context pre-fetching likely explains why the model could answer faster despite more input tokens. The WITHOUT-MCP run may have spent significant time in iterative reasoning without grounding.

#### Quality Scores (Judge Evaluation)

| Dimension         | Without MCP | With MCP  | Delta  |
| ----------------- | ----------- | --------- | ------ |
| Factual Precision | 5/5         | 4/5       | -1     |
| Technical Depth   | 5/5         | 4/5       | -1     |
| Code References   | 4/5         | 3/5       | **-1** |
| Completeness      | 5/5         | 4/5       | -1     |
| Actionability     | 4/5         | 3/5       | **-1** |
| **Total**         | **23/25**   | **18/25** | **-5** |

**Verdict**: ❌ WITHOUT MCP wins (margin: 5 points)  
**Key Differentiator**: The judge heavily weighted narrative clarity and structural organization. The WITHOUT-MCP response scored near-perfect despite **containing no actual class names, interface names, or verified data objects**. The WITH-MCP response retrieved real artifacts (`PaymentRequest`, `PaymentResponse`, `PaymentResult`, `IPaymentProcessor`, `DefaultPaymentProcessor`, actual pom.xml references) but the judge scored it lower for presentation quality. **This is a significant judge evaluation anomaly** — a factually hollow but well-written response outscored a factually grounded but slightly less polished one. This finding calls into question whether the judge's weighting of "narrative clarity" is appropriate for a code-intelligence benchmark.

---

### Prompt 4: `impact-complex`

**Prompt**: _"If I change the `PaymentRequest` class to add a new required field `merchantCategory`, what files would need to be updated and in what order?"_

> ⚠️ **Model Identity Flag**: This prompt was executed with **Claude Sonnet 4.6** (200K context), not GPT-4o/GPT 5.4 as configured. Results not directly comparable to GPT-4o prompts.

#### MCP Preflight

| Property       | Value                                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| Status         | ✅ ready                                                                       |
| Runnable       | true                                                                           |
| Summary        | All 3 tools available: `search_codebase`, `search_codebase_hybrid`, `get_file` |
| Blocked Tools  | none                                                                           |
| Fallback Tools | none                                                                           |

#### Performance Metrics

| Metric             | Without MCP | With MCP | Delta         |
| ------------------ | ----------- | -------- | ------------- |
| Response Time (ms) | 68,350      | 76,218   | **+11.5%** ❌ |
| Input Tokens       | 11,883      | 40,857   | **+244.0%**   |
| Output Tokens      | 3,597       | 3,847    | +7.0%         |
| Total Tokens       | 15,480      | 44,704   | **+188.8%**   |
| Est. Cost ($)      | $0.0657     | $0.1406  | **+114.1%**   |

> **Note**: The massive token delta (+244% input) reflects the cost of retrieving 12 files' worth of context via MCP for a thorough impact analysis. This is the most expensive prompt in the corpus.

#### Quality Scores (Judge Evaluation)

| Dimension         | Without MCP | With MCP  | Delta  |
| ----------------- | ----------- | --------- | ------ |
| Factual Precision | 3/5         | 5/5       | **+2** |
| Technical Depth   | 4/5         | 5/5       | **+1** |
| Code References   | 3/5         | 4/5       | **+1** |
| Completeness      | 4/5         | 5/5       | **+1** |
| Actionability     | 4/5         | 4/5       | 0      |
| **Total**         | **18/25**   | **23/25** | **+5** |

**Verdict**: ✅ WITH MCP wins (margin: 5 points)  
**Key Differentiator**: Change impact analysis is the highest-value use case for RAG-grounded responses. The WITH-MCP response identified **12 specific files** with exact paths (`PaymentRequest.java`, `PaymentRequestMapper.java`, `PaymentRequestValidator.java`, `AchPaymentRequestBuilder.java`, `RtpPaymentRequestBuilder.java`, `PaymentGatewayController.java`, and 6 test files) and provided a dependency-informed update order. The WITHOUT-MCP response gave a generic layered update plan with no actual file names. The quality improvement (+5 points, +28%) justified the 114% cost premium for this prompt type.

---

### Prompt 5: `nonexistent-negative`

**Prompt**: _"Where is the `CryptoPaymentAdapter` class defined and what does it do?"_

#### MCP Preflight

| Property       | Value                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| Status         | 🚫 blocked                                                                |
| Runnable       | false (rejected by opencode permission system)                            |
| Summary        | `ia-framework_benchmark_preflight` rejected by opencode permission system |
| Blocked Tools  | `ia-framework_benchmark_preflight`                                        |
| Fallback Tools | none detected by preflight                                                |

> ⚠️ **Note**: Despite the blocked preflight, WITH-MCP execution **succeeded** in calling search tools. The block was again isolated to the preflight probe, not the MCP retrieval tools. Execution proceeded with functional MCP tools.

#### Performance Metrics

| Metric             | Without MCP | With MCP | Delta         |
| ------------------ | ----------- | -------- | ------------- |
| Response Time (ms) | 26,275      | 25,409   | -3.3%         |
| Input Tokens       | 13,656      | 8,688    | **-36.4%** ✅ |
| Output Tokens      | 1,078       | 1,020    | -5.4%         |
| Total Tokens       | 14,734      | 9,708    | **-34.1%** ✅ |
| Est. Cost ($)      | $0.0449     | $0.0319  | **-29.0%** ✅ |

#### Quality Scores (Judge Evaluation)

| Dimension         | Without MCP | With MCP | Delta  |
| ----------------- | ----------- | -------- | ------ |
| Factual Precision | 1/5         | 2/5      | +1     |
| Technical Depth   | 3/5         | 1/5      | **-2** |
| Code References   | 2/5         | 2/5      | 0      |
| Completeness      | 3/5         | 1/5      | **-2** |
| Actionability     | 2/5         | 1/5      | **-1** |
| **Total**         | **11/25**   | **7/25** | **-4** |

**Verdict**: ❌ WITHOUT MCP "wins" (margin: 4 points) — **⚠️ JUDGE SCORING ANOMALY — SEE CRITICAL FINDING BELOW**

**Key Differentiator / Critical Finding**:

> 🚨 **This result represents the most important finding in this benchmark.** The WITHOUT-MCP response **hallucinated** a detailed, plausible-sounding description of a `CryptoPaymentAdapter` class — including fake package paths, fake method signatures, and fabricated Bitcoin/Ethereum payment processing capabilities — and **scored higher (11/25)** than the WITH-MCP response (7/25) which **correctly** reported that the class does not exist. The judge rewarded elaborateness over truthfulness, assigning higher "Technical Depth" (3 vs 1) and "Completeness" (3 vs 1) scores to the hallucinated answer.
>
> This is a **judge calibration failure** for negative-space queries. In a production code intelligence system, confidently hallucinating a non-existent class is far more dangerous than a correct "class not found" response. The WITH-MCP response was appropriately terse ("The class does not appear to exist; these are the actual adapters"), but should have scored higher on Actionability by providing more guidance on where to look or how to confirm. The judge's penalty for brevity on a non-existent class query is inappropriate without accounting for hallucination risk.

---

### Prompt 6: `error-edge-case`

**Prompt**: _"How does the system handle payment processing errors and retries? Show the error handling flow."_

#### MCP Preflight

| Property       | Value                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| Status         | 🚫 blocked                                                                |
| Runnable       | false (rejected by opencode permission system)                            |
| Summary        | `ia-framework_benchmark_preflight` rejected by opencode permission system |
| Blocked Tools  | `ia-framework_benchmark_preflight`                                        |
| Fallback Tools | none detected by preflight                                                |

> ⚠️ **Note**: WITH-MCP execution still succeeded in calling `search_codebase`, retrieving real class references. The preflight block did not prevent MCP tool usage.

#### Performance Metrics

| Metric             | Without MCP | With MCP | Delta  |
| ------------------ | ----------- | -------- | ------ |
| Response Time (ms) | 14,988      | 12,913   | -13.8% |
| Input Tokens       | 13,160      | 13,273   | +0.9%  |
| Output Tokens      | 649         | 638      | -1.7%  |
| Total Tokens       | 13,809      | 13,911   | +0.7%  |
| Est. Cost ($)      | $0.0394     | $0.0396  | +0.4%  |

#### Quality Scores (Judge Evaluation)

| Dimension         | Without MCP | With MCP | Delta  |
| ----------------- | ----------- | -------- | ------ |
| Factual Precision | 1/5         | 2/5      | **+1** |
| Technical Depth   | 2/5         | 2/5      | 0      |
| Code References   | 2/5         | 2/5      | 0      |
| Completeness      | 2/5         | 2/5      | 0      |
| Actionability     | 1/5         | 1/5      | 0      |
| **Total**         | **8/25**    | **9/25** | **+1** |

**Verdict**: ✅ WITH MCP wins (margin: 1 point — marginal)  
**Key Differentiator**: Both responses performed poorly on this prompt. WITHOUT-MCP described generic Spring Boot patterns (`@ExceptionHandler`, `@ControllerAdvice`, circuit breakers) with no actual class names. WITH-MCP retrieved `PaymentProcessingException`, `RetryConfiguration`, and `ErrorHandlingAdvice` and correctly described the actual retry policy (3 retries, exponential backoff), earning +1 on Factual Precision. However, both responses lacked depth and actionable detail, suggesting the RAG retrieval returned relevant class names but not sufficient implementation detail to produce a high-quality answer. More aggressive `get_file` calls on the identified classes would have improved this prompt significantly.

---

## Aggregate Summary

| Metric              | Without MCP (avg/total) | With MCP (avg/total) | Delta         |
| ------------------- | ----------------------- | -------------------- | ------------- |
| Avg Response Time   | 61,278 ms               | 43,768 ms            | **-28.6%** ✅ |
| Total Response Time | 367,667 ms              | 262,606 ms           | **-28.6%** ✅ |
| Avg Input Tokens    | 21,545                  | 26,167               | +21.4%        |
| Avg Output Tokens   | 1,931                   | 2,051                | +6.2%         |
| Avg Total Tokens    | 23,475                  | 28,218               | +20.2%        |
| Avg Quality Score   | 14.67 / 25              | 15.33 / 25           | **+4.5%**     |
| Total Quality Score | 88 / 150                | 92 / 150             | **+4**        |
| Total Est. Cost     | $0.439                  | $0.516               | **+17.4%**    |
| Win Rate (quality)  | 3 / 6 prompts           | 3 / 6 prompts        | Tied          |

> **Note on Win Rate**: Each mode won 3 prompts. However, WITH-MCP's 3 wins include the highest-margin victory (+11, function-keyword) while WITHOUT-MCP's wins include two cases of narrative polish over factual grounding and one hallucinated "win" (nonexistent-negative). Adjusted for hallucination risk, WITH-MCP has a stronger real-world edge.

---

## Dimension Analysis

### MCP Improvement by Quality Dimension (aggregated across all 6 prompts)

| Dimension         | Without MCP (total) | With MCP (total) | Delta  | % Change   |
| ----------------- | ------------------- | ---------------- | ------ | ---------- |
| Factual Precision | 15 / 30             | 20 / 30          | **+5** | **+33.3%** |
| Code References   | 17 / 30             | 19 / 30          | **+2** | **+11.8%** |
| Technical Depth   | 20 / 30             | 19 / 30          | -1     | -5.0%      |
| Completeness      | 20 / 30             | 19 / 30          | -1     | -5.0%      |
| Actionability     | 16 / 30             | 15 / 30          | -1     | -6.3%      |

### Ranked by Improvement (highest to lowest delta)

1. **Factual Precision**: +5 points (+33.3%) — MCP's strongest gain. When RAG retrieval works, it consistently eliminates hallucinations and grounds answers in actual class names, method signatures, and file paths. This was the defining difference in prompts 2, 4, and 5.

2. **Code References**: +2 points (+11.8%) — MCP reliably increased the number of actual code references in responses. Every WITH-MCP response cited more real identifiers than its WITHOUT-MCP counterpart, even on prompts where the overall score was lower.

3. **Technical Depth**: -1 point (-5.0%) — MCP showed marginal regression here. In prompts 1 and 3, the WITHOUT-MCP responses exhibited higher "perceived" technical depth through well-structured architectural prose, even though the depth was based on general Spring Boot knowledge rather than the actual codebase. RAG retrieval disrupted narrative flow in those prompts.

4. **Completeness**: -1 point (-5.0%) — Same pattern as Technical Depth. Judge rewarded comprehensive narratives over targeted factual answers in the architectural prompts. The brevity of the negative-space response (Prompt 5) also dragged this metric down.

5. **Actionability**: -1 point (-6.3%) — The largest relative regression. MCP responses tended to list facts (here are the classes, here are the files) without always connecting those facts to clear next steps. This is a prompt engineering and response formatting gap, not a fundamental RAG limitation.

### Dimensions Where MCP Showed No Improvement or Regression

- **Technical Depth** (-1): RAG context retrieval, when it returns fragmented code chunks, can interrupt the model's ability to construct a coherent conceptual explanation. The fix is better chunk coherence and re-ranking, not less retrieval.
- **Completeness** (-1): MCP responses were sometimes shorter and more targeted, which the judge interpreted as incomplete rather than precise.
- **Actionability** (-1): Retrieved code facts were not always translated into clear developer actions. Prompt templates need to instruct the model to connect retrieved context to actionable guidance.

---

## Cost-Benefit Analysis

### Per-Prompt Cost Breakdown

| Prompt               | Without MCP | With MCP    | Delta                | Quality Delta |
| -------------------- | ----------- | ----------- | -------------------- | ------------- |
| arch-semantic        | $0.1731     | $0.1600     | -$0.013 (-7.5%)      | -4 pts        |
| function-keyword     | $0.0214     | $0.0214     | $0.000 (0%)          | +11 pts       |
| deps-cross-file ⚠️   | $0.0945     | $0.1220     | +$0.028 (+29%)       | -5 pts        |
| impact-complex ⚠️    | $0.0657     | $0.1406     | +$0.075 (+114%)      | +5 pts        |
| nonexistent-negative | $0.0449     | $0.0319     | -$0.013 (-29%)       | -4 pts\*      |
| error-edge-case      | $0.0394     | $0.0396     | $0.000 (+0.4%)       | +1 pt         |
| **TOTAL**            | **$0.4390** | **$0.5155** | **+$0.077 (+17.4%)** | **+4 pts**    |

> \*Quality delta on nonexistent-negative is a judge anomaly (hallucinated response scored higher). True quality improvement with MCP is positive for this case.

### Summary Metrics

- **Additional token cost per prompt (avg)**: +4,743 tokens ($0.013/prompt)
- **Quality improvement**: +4 points total (+4.5%)
- **Quality points per additional $1**: ~52 quality points per additional $1 spent
- **Break-even**: MCP pays for itself if even marginal improvement in factual precision matters — the hallucination prevention on the negative-space prompt alone justifies the cost for a production payment system where hallucinated class descriptions could cause serious developer confusion.

### Cost Estimation Basis

- **Model (Prompts 1, 2, 5, 6)**: GPT-4o via GitHub Copilot
- **Model (Prompts 3, 4)**: Claude Sonnet 4.6 via GitHub Copilot — GPT-4o pricing applied as approximation; actual costs for these prompts may be **30–50% higher** at Claude Sonnet 4.6 rates
- **Input pricing**: ~$2.50/MTok (estimated — GitHub Copilot pricing approximate)
- **Output pricing**: ~$10.00/MTok (estimated — GitHub Copilot pricing approximate)
- ⚠️ **All cost figures are approximate estimates**. GitHub Copilot does not publish per-token rates publicly; actual billing may differ.

---

## RAG Improvement Insights

### Identified Weaknesses

For each quality dimension where MCP scored < 4/5 average or showed regression:

- **Technical Depth** (avg WITH-MCP: 3.17/5): MCP retrieval returned fragmented code chunks that interrupted coherent architectural narration. Responses cited real class names but failed to synthesize them into a conceptual explanation with the same fluency as general LLM knowledge.
  - **Root Cause Hypothesis**: Chunk boundaries are cutting across class boundaries or method boundaries, returning partial context that is hard for the model to synthesize into narrative form.
  - **Affected Component**: `packages/core` — chunking strategy (likely fixed-size or line-count chunking rather than AST-aware semantic chunking)

- **Actionability** (avg WITH-MCP: 2.5/5): Retrieved facts were surfaced but not translated into developer-ready next steps. Responses answered "what" (here are the files) but not "how" (here is what to do in each file).
  - **Root Cause Hypothesis**: System prompt / tool invocation instructions do not instruct the model to synthesize retrieved context into actionable guidance. The model is treating RAG retrieval as a lookup task, not a reasoning task.
  - **Affected Component**: `packages/mcp-server` — tool result formatting and system prompt templates

- **Completeness** (avg WITH-MCP: 3.17/5): The negative-space prompt response was too terse. MCP correctly identified the absence of a class but did not elaborate on alternatives, likely because no follow-up `get_file` calls were made after the negative search result.
  - **Root Cause Hypothesis**: No fallback search strategy when the primary search returns zero results. The agent stops at the first search failure instead of expanding the query or surfacing related entities.
  - **Affected Component**: `packages/mcp-server` — zero-result handling / fallback search orchestration

- **Code References on Cross-File Queries** (Prompt 3 WITH-MCP: 3/5): Cross-module dependency queries required retrieving Maven POM files AND Java interface files AND implementation files. Partial results meant only some of the relevant artifacts were surfaced.
  - **Root Cause Hypothesis**: Dependency graph expansion (`expand_hops`) may not be aggressive enough for cross-module Maven queries. Module-level dependencies are not traversed.
  - **Affected Component**: `packages/core` — dependency graph expansion for Maven multi-module projects

### Proposed Improvements (Prioritized — ready for GSD milestone)

| #   | Improvement                                      | Affected Package      | Effort | Expected Impact                                          |
| --- | ------------------------------------------------ | --------------------- | ------ | -------------------------------------------------------- |
| 1   | AST-aware semantic chunking for Java/Spring Boot | `packages/core`       | L      | +Technical Depth +1.5, +Code References +1               |
| 2   | Zero-result fallback search strategy             | `packages/mcp-server` | M      | +Completeness +1.5, +Actionability +1 (negative queries) |
| 3   | Maven multi-module dependency graph traversal    | `packages/core`       | M      | +Code References +1.5, +Completeness +1 (cross-module)   |
| 4   | RAG-to-action prompt templates                   | `packages/mcp-server` | S      | +Actionability +1 across all prompts                     |
| 5   | Judge calibration: hallucination penalty scoring | `packages/benchmark`  | S      | Accurate benchmark signal for negative-space prompts     |
| 6   | Benchmark executor model lock enforcement        | `packages/benchmark`  | S      | Data quality: prevent model identity inconsistency       |

---

**Details:**

#### 1. [P1] AST-Aware Semantic Chunking for Java/Spring Boot

- **Problem**: The benchmark revealed that architectural and cross-file prompts (Prompts 1, 3) received lower Technical Depth scores with MCP despite having real code context. The retrieved chunks appeared fragmented — class names were present but method bodies, interface contracts, and class relationships were split across chunk boundaries. This caused the model to produce factually grounded but narratively disjointed responses.
- **Proposed Solution**: Replace fixed-size/line-count chunking with AST-aware chunking using `web-tree-sitter` with a Java grammar. Chunks should align to semantic boundaries: one chunk per class declaration (with full Javadoc), one chunk per method, one chunk per interface. Add a `class_summary` synthetic chunk that lists a class's fields, method signatures, and implemented interfaces — enabling retrieval of class structure without needing to retrieve the full implementation.
- **Affected Package**: `packages/core` (indexer / chunking pipeline)
- **Expected Impact**: +Technical Depth (+1 to 1.5 pts avg), +Code References (+0.5 to 1 pt avg), +Factual Precision (+0.5 pt avg). Especially impactful for Prompts 1 and 3 category queries.
- **Effort Estimate**: Large (requires adding Java tree-sitter grammar, rewriting chunking pipeline, re-indexing corpus)
- **GSD Phase Goal**: Implement AST-aware semantic chunking for Java using web-tree-sitter, producing class-boundary and method-boundary chunks with synthetic class summary nodes

#### 2. [P2] Zero-Result Fallback Search Strategy

- **Problem**: Prompt 5 (nonexistent-negative) demonstrated that when a search returns zero results, the MCP response was too brief and failed to provide useful alternatives or guidance. The WITHOUT-MCP hallucination scored higher simply by being more verbose. A well-designed fallback should: (a) confirm the class doesn't exist, (b) search for similarly-named classes, (c) suggest related classes that might fulfill the same purpose.
- **Proposed Solution**: In the MCP server, implement a zero-result detection hook: when `search_codebase` or `search_codebase_hybrid` returns 0 results, automatically trigger a fuzzy/partial-name fallback search (e.g., strip `Adapter` suffix, search for `Crypto` as a standalone term), then surface the closest existing entities. Include this fallback logic in the tool response metadata so the calling LLM knows to use the alternative results.
- **Affected Package**: `packages/mcp-server` (tool handlers, zero-result orchestration)
- **Expected Impact**: +Completeness (+1.5 pts on negative-space queries), +Actionability (+1 pt), +Factual Precision (+0.5 pt). Directly addresses the judge anomaly on Prompt 5.
- **Effort Estimate**: Medium (requires tool handler modification, fuzzy search support in Qdrant client adapter)
- **GSD Phase Goal**: Implement zero-result fallback with fuzzy entity search and alternative suggestion in MCP retrieval tools

#### 3. [P3] Maven Multi-Module Dependency Graph Traversal

- **Problem**: Prompt 3 (deps-cross-file) required understanding cross-module dependencies. The MCP retrieval found some relevant files but missed the full picture — particularly the Maven POM dependency declarations that define the module dependency graph. Java multi-module Maven projects have a structural dependency graph that is not captured by code-level semantic search alone.
- **Proposed Solution**: Index Maven POM files as structured metadata with explicit module dependency edges. Add a `get_dependencies` tool variant that accepts a module name and returns its declared Maven dependencies, then uses those to scope subsequent code searches. Consider adding `expand_hops=2` support for cross-module traversal that follows `<dependency>` declarations in pom.xml files to identify relevant modules before searching their code.
- **Affected Package**: `packages/core` (indexer: Maven POM parser), `packages/mcp-server` (get_dependencies tool extension)
- **Expected Impact**: +Code References (+1 to 1.5 pts on cross-module queries), +Completeness (+1 pt), +Factual Precision (+0.5 pt)
- **Effort Estimate**: Medium (Maven POM parsing is straightforward XML; the dependency graph edges need to be stored in Qdrant payload or SQLite)
- **GSD Phase Goal**: Index Maven POM dependency graph and expose cross-module traversal via get_dependencies tool

#### 4. [P4] RAG-to-Action Prompt Templates

- **Problem**: Across all prompts, WITH-MCP responses were factually stronger but scored lower on Actionability. The model cited retrieved classes and files but didn't consistently translate them into concrete developer steps. This is a prompt engineering gap rather than a retrieval quality issue.
- **Proposed Solution**: Add a system prompt template layer to the MCP server that wraps retrieved context with explicit instructions: "Based on the retrieved code context, provide (1) the factual answer, (2) specific files to examine or modify, (3) a step-by-step action plan for the developer." These templates should be prompt-type-aware (semantic query vs. impact analysis vs. symbol lookup) and injected as part of the MCP tool result metadata.
- **Affected Package**: `packages/mcp-server` (system prompt template engine)
- **Expected Impact**: +Actionability (+0.5 to 1 pt across all prompts), +Completeness (+0.5 pt). Low effort, high leverage.
- **Effort Estimate**: Small (pure prompt engineering, no infrastructure changes)
- **GSD Phase Goal**: Implement prompt-type-aware response templates that guide the LLM from retrieved context to actionable developer guidance

#### 5. [P5] Judge Calibration: Hallucination Penalty Scoring

- **Problem**: The benchmark judge awarded Prompt 5's hallucinated WITHOUT-MCP response a score of 11/25 (vs 7/25 for the correct WITH-MCP response). This is a fundamental judge calibration failure for negative-space queries. The current judge appears to reward elaborateness and narrative structure without penalizing factual fabrication. In a code intelligence benchmark for a payment gateway, hallucinated class descriptions are a critical failure mode, not a minor penalty.
- **Proposed Solution**: Add a mandatory "Hallucination Penalty" dimension (or a hard override rule) to the judge prompt: "If the response asserts the existence or behavior of a code entity that cannot be verified in the provided context or known facts, apply a -3 to -5 point penalty to Factual Precision and flag the response as 'hallucination risk: high'. A terse but correct 'not found' response must always score higher than a detailed but hallucinated response." Also add a "Negative Space Correctness" sub-dimension for prompts asking about potentially non-existent entities.
- **Affected Package**: `packages/benchmark` (judge prompt templates, scoring dimensions)
- **Expected Impact**: Accurate benchmark signal for negative-space prompts, preventing the current false signal that rewards hallucination. Improves benchmark validity across all future runs.
- **Effort Estimate**: Small (judge prompt modification, scoring rubric update)
- **GSD Phase Goal**: Calibrate benchmark judge to penalize hallucination and correctly score "entity not found" responses higher than hallucinated descriptions

#### 6. [P6] Benchmark Executor Model Lock Enforcement

- **Problem**: Prompts 3 and 4 were executed with Claude Sonnet 4.6 instead of the configured GPT 5.4/GPT-4o, creating data quality issues in the benchmark corpus. Different models have different context windows (128K vs 200K), output limits, and latency profiles — making cross-prompt aggregates misleading.
- **Proposed Solution**: Add a model identity verification step at the start of each benchmark execution: call a lightweight "self-identification" probe before each prompt, compare the returned model identity against the configured model, and abort with an error if they don't match. Store the verified model identity in the benchmark result metadata. The `ia-framework_benchmark_preflight` check should include model identity verification.
- **Affected Package**: `packages/benchmark` (executor, preflight checks)
- **Expected Impact**: Data quality improvement — all future benchmarks will have consistent model identity, making aggregates statistically valid.
- **Effort Estimate**: Small (pre-execution validation hook)
- **GSD Phase Goal**: Enforce model identity consistency in benchmark executor with pre-run validation and abort-on-mismatch logic

### RAG Pipeline Health Score

Based on the 6 prompt results:

| Component                | Score  | Justification                                                                                                                                                                                                                                                 |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Retrieval Relevance**  | 6/10   | Retrieved the right files for keyword (Prompt 2) and impact analysis (Prompt 4), but returned partial/fragmented context for architectural (Prompt 1) and cross-file (Prompt 3) queries. Error-handling prompt retrieved class names but not implementations. |
| **Context Quality**      | 5/10   | Chunk contents were sufficient for symbol lookups but insufficient for architectural synthesis. AST-unaware chunking is the primary driver of context quality issues.                                                                                         |
| **Response Integration** | 5/10   | Models integrated retrieved context into factual claims well, but consistently failed to translate those facts into well-organized, actionable narratives. Prompt template guidance is missing.                                                               |
| **Overall RAG Health**   | 5.5/10 | Functional for high-value use cases (symbol lookup, impact analysis) but needs significant chunking and prompt engineering work to compete with well-structured general LLM responses on narrative/architectural queries.                                     |

### Priority Recommendation

> **Implement AST-aware semantic chunking for Java** (`packages/core`) — this single change would improve chunk coherence across the entire corpus, directly addressing the Technical Depth regression and Code References gaps observed in 4 of the 6 prompts.

---

## Recommendations

### Should MCP remain enabled?

**YES** — with important caveats and the improvements listed above.

**Justification**:

- **Overall quality**: WITH-MCP scored +4 points higher (92 vs 88 / 150 total), a 4.5% improvement
- **Speed**: WITH-MCP was 28.6% faster on average, a significant operational benefit
- **Hallucination prevention**: The most important finding is Prompt 5 — without MCP, the system hallucinated a detailed description of a non-existent class. In a payment gateway codebase, this type of hallucination (describing a `CryptoPaymentAdapter` with Bitcoin support that doesn't exist) could cause significant developer confusion, wasted investigation time, or worse, false confidence in a non-existent security boundary. MCP's correct "class not found" response is worth far more than the judge's score implies.
- **High-value use cases**: Keyword/symbol lookup (+11 pts) and impact analysis (+5 pts) are the most common developer tasks in a large monorepo. MCP consistently wins on these.
- **Where MCP currently underperforms**: Narrative architectural explanations where general LLM knowledge is polished and RAG context is fragmented. This is a chunking quality problem, not an architecture problem.

### Prompt Categories Where MCP Adds Most Value

1. **Symbol/function lookup** (keyword category): +11 points — finding all usages of a function is impossible without RAG retrieval. Without MCP, these queries produce zero useful output.
2. **Change impact analysis** (complex category): +5 points — identifying all affected files for a class change requires traversing the actual dependency graph. General LLM knowledge produces only generic layered-architecture advice.
3. **Negative-space / non-existent entity queries** (negative category): MCP correctly returns "not found" — judge score understated; real-world value is very high for preventing hallucinated technical debt.

### Prompt Categories Where MCP Shows Marginal or Negative Return (currently)

1. **High-level architectural overview** (semantic category): -4 points — general LLM knowledge of Spring Boot patterns is surprisingly competitive when chunking is poor. Improve chunking to close this gap.
2. **Cross-module dependency analysis** (cross-file category): -5 points — requires Maven POM graph traversal that is not yet implemented. Maven multi-module support is a prerequisite for this category.
3. **Error handling flow** (edge-case category): +1 point (marginal) — MCP retrieved class names but not implementation depth. Deeper `get_file` follow-up calls are needed.

### Potential RAG Pipeline Improvements

1. **AST-aware semantic chunking** (P1) — highest priority; affects all query types
2. **Zero-result fallback search** (P2) — critical for negative-space query accuracy
3. **Maven POM dependency graph indexing** (P3) — unlocks cross-module queries
4. **RAG-to-action prompt templates** (P4) — quick win on Actionability
5. **Judge hallucination calibration** (P5) — improves benchmark signal quality

### Suggested Next Steps

1. **Immediate** (this sprint): Fix the benchmark executor model lock (P6) to ensure future benchmark runs use the configured model consistently. This is a small effort with high data quality impact.
2. **Short-term** (next GSD phase): Implement the judge hallucination calibration (P5) and RAG-to-action prompt templates (P4) — both are small effort, high signal/impact improvements that don't require infrastructure changes.
3. **Medium-term**: Design and implement AST-aware Java chunking (P1) — the highest-impact infrastructure change. Plan for a full corpus re-index after implementation.
4. **Medium-term**: Implement zero-result fallback search strategy (P2) — improves negative-space query behavior with moderate effort.
5. **Re-benchmark after P1+P2**: Re-run this exact 6-prompt corpus after chunking and fallback improvements to measure delta. Expect Technical Depth and Completeness to recover by 1–1.5 points, flipping the aggregate win rate from 3/6 to 4–5/6 in favor of WITH-MCP.
6. **Re-run with consistent model**: Execute a clean benchmark pass with GPT-4o consistently across all 6 prompts to eliminate the Claude Sonnet 4.6 data quality contamination.

---

## Appendix: Raw Score Summary

| Prompt ID            | Category   | Preflight           | WITHOUT Score | WITH Score | Delta   | Time Delta | Cost Delta |
| -------------------- | ---------- | ------------------- | ------------- | ---------- | ------- | ---------- | ---------- |
| arch-semantic        | semantic   | ready               | 23/25         | 19/25      | -4      | -10.8%     | -7.5%      |
| function-keyword     | keyword    | blocked\*           | 5/25          | 16/25      | **+11** | -56.5%     | 0%         |
| deps-cross-file      | cross-file | ready               | 23/25 ⚠️      | 18/25 ⚠️   | -5      | -65.9%     | +29.0%     |
| impact-complex       | complex    | ready               | 18/25 ⚠️      | 23/25 ⚠️   | **+5**  | +11.5%     | +114.1%    |
| nonexistent-negative | negative   | blocked\*           | 11/25 🚨      | 7/25       | -4†     | -3.3%      | -29.0%     |
| error-edge-case      | edge-case  | blocked\*           | 8/25          | 9/25       | +1      | -13.8%     | +0.4%      |
| **TOTALS**           | —          | 3 ready / 3 blocked | **88/150**    | **92/150** | **+4**  | **-28.6%** | **+17.4%** |

> ⚠️ = Claude Sonnet 4.6 used instead of GPT-4o (model identity inconsistency)  
> 🚨 = Hallucinated response scored higher than correct response (judge calibration issue)
>
> - = Preflight blocked but MCP tools still functional for 2 of 3 blocked prompts  
>   † = Score delta misleading; WITHOUT-MCP hallucinated, WITH-MCP was factually correct

---

_Report generated by Benchmark Reporter (claude-sonnet-4.6 via github-copilot/claude-sonnet-4.6)_  
_Saved: `.opencode/benchmark/results/benchmark-report-2026-04-24.md`_
