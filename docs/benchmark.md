# Benchmark CLI Reference

The `ia-framework benchmark` command measures RAG retrieval quality for your indexed codebase. It runs natural language queries against the vector store and reports Hit@K, MRR (Mean Reciprocal Rank), and latency.

## Quick Start

```bash
# 1. Generate a starter corpus (requires Ollama running locally)
ia-framework benchmark init-corpus

# 2. Run the benchmark
ia-framework benchmark run

# 3. Review results
ia-framework benchmark list

# 4. Compare runs after tuning
ia-framework benchmark compare <runId1> <runId2>
```

---

## Subcommands

### `benchmark init-corpus`

Generate a 30-query benchmark corpus tailored to your project using a local or remote LLM.

```
ia-framework benchmark init-corpus [options]
```

| Option                | Default                                      | Description                                     |
| --------------------- | -------------------------------------------- | ----------------------------------------------- |
| `-c, --config <path>` | `.ia-framework/project.json`                 | Path to project.json config                     |
| `--corpus <path>`     | `.ia-framework/benchmark-queries.json`       | Output path for corpus file                     |
| `--model <model>`     | `llama3.2` (Ollama) / `gpt-4o-mini` (OpenAI) | Completion model to use                         |
| `--force`             | off                                          | Overwrite existing corpus without backup prompt |
| `-h, --help`          | —                                            | Display help                                    |

**How it works:**

1. Walks the target project's source files and samples up to 60 files
2. Sends a structured prompt to the LLM requesting 30 queries across 6 categories
3. Validates `expectedFiles` entries against disk (removes non-existent paths)
4. Backs up any existing corpus to `.bak` before overwriting

**Query categories generated:**

| Category      | Count | Description                                                   |
| ------------- | ----- | ------------------------------------------------------------- |
| `sem-01..05`  | 5     | Semantic — conceptual/functional questions                    |
| `kw-01..05`   | 5     | Keyword — exact symbol/class lookups                          |
| `xf-01..05`   | 5     | Cross-file — queries expecting 2+ files                       |
| `cx-01..05`   | 5     | Complex — multi-concept retrieval                             |
| `neg-01..05`  | 5     | Negative — topics NOT in the codebase (empty `expectedFiles`) |
| `edge-01..05` | 5     | Edge-case — boundary/failure behaviors                        |

**Default provider:**

Uses local Ollama (`llama3.2`) by default — no API key required. If Ollama is unreachable, the command prints setup instructions and exits without error.

To use OpenAI instead:

```bash
OPENAI_API_KEY=sk-... ia-framework benchmark init-corpus --model gpt-4o-mini
```

**Example output:**

```bash
$ ia-framework benchmark init-corpus
Generating 30-query corpus for /path/to/your/project...
✓ Corpus written to .ia-framework/benchmark-queries.json (30 queries)
```

---

### `benchmark run`

Run benchmark queries against the indexed codebase and record results.

```
ia-framework benchmark run [options]
```

| Option                | Default                                | Description                                      |
| --------------------- | -------------------------------------- | ------------------------------------------------ |
| `-c, --config <path>` | `.ia-framework/project.json`           | Path to project.json config                      |
| `-k, --top-k <n>`     | `10`                                   | Number of results to retrieve per query          |
| `-t, --threshold <n>` | `0.5`                                  | Score threshold (use `>1.0` for no-RAG baseline) |
| `-b, --baseline`      | off                                    | Run no-RAG baseline (sets `scoreThreshold=2.0`)  |
| `-l, --label <text>`  | —                                      | Human-readable label for this run                |
| `--corpus <path>`     | `.ia-framework/benchmark-queries.json` | Path to corpus file                              |
| `-h, --help`          | —                                      | Display help                                     |

**First-run behaviour:** If no corpus file exists, the CLI auto-scaffolds an example at `.ia-framework/benchmark-queries.json` and exits. Edit the file to match your codebase, then re-run.

**Example:**

```bash
# Labelled run after re-indexing
ia-framework benchmark run --label "after-hybrid-search"

# No-RAG baseline to measure RAG lift
ia-framework benchmark run --baseline --label "no-rag-baseline"
```

---

### `benchmark list`

List recent benchmark runs with Hit@K and MRR scores.

```
ia-framework benchmark list [options]
```

| Option                | Default                      | Description                 |
| --------------------- | ---------------------------- | --------------------------- |
| `-c, --config <path>` | `.ia-framework/project.json` | Path to project.json config |
| `-n, --limit <n>`     | `10`                         | Number of runs to show      |
| `-h, --help`          | —                            | Display help                |

---

### `benchmark history`

Show Hit@K trend across recent benchmark runs in a compact table.

```
ia-framework benchmark history [options]
```

| Option                | Default                      | Description                 |
| --------------------- | ---------------------------- | --------------------------- |
| `-c, --config <path>` | `.ia-framework/project.json` | Path to project.json config |
| `-n, --limit <n>`     | `10`                         | Number of runs to include   |
| `-h, --help`          | —                            | Display help                |

---

### `benchmark compare`

Compare two benchmark runs side-by-side. Accepts full or prefix run IDs.

```
ia-framework benchmark compare [options] <runId1> <runId2>
```

| Option                | Default                      | Description                 |
| --------------------- | ---------------------------- | --------------------------- |
| `-c, --config <path>` | `.ia-framework/project.json` | Path to project.json config |
| `-h, --help`          | —                            | Display help                |

**Example:**

```bash
ia-framework benchmark compare abc123 def456
```

---

### `benchmark clean`

Delete all benchmark runs from the database. The corpus file is not affected.

```
ia-framework benchmark clean [options]
```

| Option                | Default                      | Description                 |
| --------------------- | ---------------------------- | --------------------------- |
| `-c, --config <path>` | `.ia-framework/project.json` | Path to project.json config |
| `-h, --help`          | —                            | Display help                |

---

## Corpus File Format

The corpus is a JSON file with a `queries` array. Default location: `.ia-framework/benchmark-queries.json`.

```json
{
  "queries": [
    {
      "queryId": "sem-01",
      "query": "How does the indexing pipeline chunk source files?",
      "expectedFiles": ["packages/indexer/src/pipeline.ts", "packages/indexer/src/chunker.ts"]
    },
    {
      "queryId": "neg-01",
      "query": "How does the payment processing system handle refunds?",
      "expectedFiles": []
    }
  ]
}
```

**Fields:**

| Field           | Type       | Description                                                                       |
| --------------- | ---------- | --------------------------------------------------------------------------------- |
| `queryId`       | `string`   | Unique identifier. Use `sem-`, `kw-`, `xf-`, `cx-`, `neg-`, `edge-` prefixes      |
| `query`         | `string`   | Natural language query a developer would ask                                      |
| `expectedFiles` | `string[]` | Relative paths to files that should appear in results. Empty for negative queries |

**Writing effective queries:**

- Write queries the way a developer would phrase them when searching for code
- `expectedFiles` should list the 1–3 most relevant files, not all files that mention the topic
- Negative queries (`neg-*`) test that the system doesn't hallucinate results — `expectedFiles` must be empty
- Cross-file queries (`xf-*`) must have 2+ `expectedFiles` to be meaningful
- Run `benchmark run` after editing the corpus to see how changes affect scores

---

## Metrics

| Metric      | Description                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| **Hit@K**   | Fraction of queries where at least one `expectedFile` appears in the top-K results                   |
| **MRR**     | Mean Reciprocal Rank — average of `1/rank` for the first relevant result. Higher is better (max 1.0) |
| **Latency** | Average query time in milliseconds                                                                   |

**MRR interpretation:**

| MRR   | Meaning                               |
| ----- | ------------------------------------- |
| 1.0   | Correct file is always the top result |
| 0.5   | Correct file is typically ranked 2nd  |
| 0.33  | Correct file is typically ranked 3rd  |
| < 0.3 | Retrieval needs tuning                |

---

## Storage

Results are stored in `.ia-framework/benchmarks.sqlite` alongside `project.json`. The corpus file lives at `.ia-framework/benchmark-queries.json` by default (configurable with `--corpus`).
