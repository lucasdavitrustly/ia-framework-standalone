---
name: rag-benchmark
description: Detailed protocol for RAG A/B benchmarking including corpus format, evaluation methodology, and LLM self-identification requirements
---

## RAG Benchmark Protocol

This skill defines the complete protocol for benchmarking LLM responses with
and without the ia-framework MCP server (RAG context).

## LLM Self-Identification

Every benchmark prompt MUST include a self-identification preamble that asks the
LLM to report its own metadata. This is critical for reproducibility and for
detecting if different models/configs are inadvertently used across runs.

### Self-Identification Block Template

```
Before answering the question below, provide a brief self-identification block
in EXACTLY this format at the TOP of your response:

---LLM-IDENTITY---
Model: <your exact model name and version>
Provider: <your provider name (e.g., Anthropic, OpenAI, Google)>
Reasoning Level: <the reasoning/thinking level you are using for this response (e.g., none, low, medium, high, extended)>
Context Window: <your total context window size in tokens>
Max Output Tokens: <your maximum output token limit>
---END-IDENTITY---

Now answer the following question about this codebase:
```

The orchestrator MUST prepend this block to every benchmark prompt before passing
it to the executor.

## Provider/Model Selection

Before executing any benchmark, the orchestrator MUST read `.opencode/benchmark/guide.md`
and use the `question` tool to ask the user which model to use.

### Fixed Provider

All benchmarks run through **GitHub Copilot**. No provider selection needed.

### Available Models

| Model ID        | `--model` Flag                   | Description                                  |
| --------------- | -------------------------------- | -------------------------------------------- |
| GPT 5.4         | `github-copilot/gpt-5.4`         | OpenAI GPT 5.4 via GitHub Copilot            |
| Claude Opus 4.6 | `github-copilot/claude-opus-4.6` | Anthropic Claude Opus 4.6 via GitHub Copilot |

The question tool presents only these two options. User picks one. Both runs use that model.

## Corpus Format

The benchmark corpus is a JSON file at `.opencode/benchmark/corpus.json`:

```json
{
  "prompts": [
    {
      "id": "unique-identifier",
      "category": "semantic|keyword|cross-file|complex|negative|edge-case",
      "prompt": "The actual question to ask the LLM",
      "context": "Why this prompt is useful for benchmarking"
    }
  ]
}
```

### Prompt Categories

| Category       | Purpose                                     | Example                             |
| -------------- | ------------------------------------------- | ----------------------------------- |
| **semantic**   | Tests conceptual understanding              | "How is authentication handled?"    |
| **keyword**    | Tests exact symbol/function lookup          | "Where is the createUser function?" |
| **cross-file** | Tests multi-file relationship understanding | "How do modules X and Y interact?"  |
| **complex**    | Tests multi-step reasoning                  | "What would break if we changed X?" |
| **negative**   | Tests hallucination resistance              | "Does this project use GraphQL?"    |
| **edge-case**  | Tests handling of ambiguous queries         | "Explain the performance issue"     |

## Evaluation Dimensions

The benchmark-judge evaluates on 6 dimensions (max 30 total):

- Dimensions 1-5: scored 1-5 each (Factual Precision, Technical Depth, Code References, Completeness, Actionability)
- Dimension 6: Hallucination Check — scored 0 or 5 (binary: hallucination detected = 0, no hallucination = 5)

1. **Factual Precision** — Are claims about the codebase correct?
2. **Technical Depth** — How deep is the technical understanding shown?
3. **Code References** — Does it cite specific files, functions, line numbers?
4. **Completeness** — Does it address all aspects of the question?
5. **Actionability** — Can the developer act on the response immediately?
6. **Hallucination Check** — Does the response avoid asserting facts about non-existent entities?

## Blind Evaluation Protocol

To eliminate bias:

1. The orchestrator RANDOMLY assigns responses to "A" and "B" labels
2. The judge receives ONLY "Response A" and "Response B" with no indication of which used MCP
3. After scoring, the orchestrator de-randomizes the results
4. Position is randomized per-prompt (not fixed across all prompts)

## Execution Fairness

To ensure fair comparison:

- Same model for both runs (enforced by using same --model flag)
- Same prompt text (the self-identification + user prompt)
- Non-MCP run executes FIRST (avoids MCP warming caches)
- MCP preflight runs immediately before the MCP-enabled execution and does not alter the prompt used for either scored run
- `OPENCODE_CONFIG_CONTENT` env var disables MCP cleanly
- Each run is a separate `opencode run` process (full isolation)

## MCP Preflight

Before the WITH-MCP run, the executor should invoke `benchmark_preflight` and capture its structured result.

The benchmark protocol remains intact: preflight is an execution-environment check, not an additional scored answer.

Interpret the preflight outcome with this shared vocabulary:

- `ready`: required benchmark MCP tools are callable
- `fallback`: benchmark is runnable, but one or more required tools depend on fallback coverage
- `blocked`: benchmark-critical MCP coverage is unavailable or the preflight result could not be trusted

If preflight is `blocked`, the WITH-MCP run still executes so the A/B benchmark remains comparable, but the blocked state must be carried through the structured output and final report.

## Metrics Collected

### Quantitative (from execution)

- Wall-clock response time (milliseconds)
- Input tokens (prompt tokens)
- Output tokens (completion tokens)
- Estimated cost (based on model pricing)

### Qualitative (from judge)

- 6 dimension scores (1-5 each for dims 1-5; 0 or 5 for Hallucination Check)
- Total quality score (out of 30)
- Winner verdict with margin classification
- Key differentiator explanation
- Hallucination flags (if any entities were fabricated)

## Interpreting Results

### Quality Score Ranges

| Range | Interpretation                                            |
| ----- | --------------------------------------------------------- |
| 25-30 | Excellent — deep, accurate, actionable, no hallucinations |
| 18-24 | Good — mostly accurate with minor gaps                    |
| 12-17 | Average — correct but shallow                             |
| 6-11  | Poor — significant gaps or errors                         |
| 1-5   | Very Poor — mostly wrong or irrelevant                    |

### Delta Interpretation

| Quality Delta   | Token Delta   | Verdict                              |
| --------------- | ------------- | ------------------------------------ |
| >+30% quality   | Any           | MCP strongly justified               |
| +10-30% quality | <+200% tokens | MCP justified                        |
| +10-30% quality | >+200% tokens | MCP borderline — review RAG pipeline |
| <+10% quality   | Any           | MCP may not be adding value          |
| Negative        | Any           | RAG pipeline needs investigation     |
