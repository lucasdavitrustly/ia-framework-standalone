---
phase: quick-260407-gjl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
autonomous: true
requirements: []
must_haves:
  truths:
    - 'README documents the search_codebase_hybrid MCP tool'
    - 'README documents MRR-tuned score threshold of 0.3'
    - 'README documents benchmark init-corpus CLI subcommand'
    - 'README documents corpus command defaulting to local Ollama (llama3.2)'
    - 'A GitHub PR is open with all changes since main'
  artifacts:
    - path: 'README.md'
      provides: 'Updated documentation for Phase 11 additions'
  key_links:
    - from: 'README.md MCP Tools table'
      to: 'search_codebase_hybrid entry'
      via: 'manual addition to table'
      pattern: 'search_codebase_hybrid'
---

<objective>
Update README.md to document Phase 11 MRR optimizations and recent quick task additions (corpus CLI with Ollama defaults), then open a GitHub PR with all changes on the current branch since main.

Purpose: The v1.0 milestone is complete but the README doesn't yet reflect: hybrid search, MRR-tuned thresholds, prose-description embeddings, or the new corpus generation CLI. Ship docs then open PR.
Output: Updated README.md committed + open GitHub PR.
</objective>

<execution_context>
@~/.config/opencode/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@README.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update README.md with Phase 11 MRR additions and corpus CLI</name>
  <files>README.md</files>
  <action>
Make the following targeted edits to README.md:

**1. Recent Improvements section (lines 104–112)**
Add these bullet points at the TOP of the existing list (after `## Recent Improvements`):

```
- **Hybrid search (MRR-optimized)** — New `search_codebase_hybrid` MCP tool combines BM25 sparse vectors with dense semantic vectors and fuses results with Reciprocal Rank Fusion (RRF). Use it alongside `search_codebase` for higher recall on exact-match queries.
- **MRR-tuned score threshold** — Default `score_threshold` lowered from 0.5 → 0.3 based on a benchmark sweep (tested 0.3/0.4/0.5/0.6); 0.3 delivers max recall at equal precision (MRR=0.50 across the range, 0.6 dropped to MRR=0.46).
- **Prose-description embeddings** — Text vectors now embed a structured prose description of each chunk (name, type, file, signature, docstring) instead of raw source. Improves semantic search quality, especially for non-text-heavy code.
- **Corpus generator CLI** — `ia-framework benchmark init-corpus` generates a starter benchmark corpus using an LLM to write queries from your indexed chunks — no manual editing to get started.
```

**2. MCP Tools table (around line 284–293)**
Add a row for `search_codebase_hybrid` to the MCP Tools table:

After the `search_codebase` row, add:

```
| `search_codebase_hybrid` | Hybrid BM25 + semantic search with RRF fusion — higher recall for exact-match queries |
```

**3. MCP Tools (Detailed) section — add search_codebase_hybrid subsection**
After the `### search_codebase` subsection (around line 467), add a new `### search_codebase_hybrid` subsection:

```markdown
### search_codebase_hybrid

Combines BM25 sparse vectors (term frequency) with dense semantic vectors and fuses the ranked lists using Reciprocal Rank Fusion (RRF). Best for queries that mix semantic intent with exact identifiers.

| Parameter         | Type   | Default  | Description                                                       |
| ----------------- | ------ | -------- | ----------------------------------------------------------------- |
| `query`           | string | required | Natural language search query                                     |
| `limit`           | number | 10       | Maximum number of results                                         |
| `score_threshold` | number | 0.3      | Minimum similarity score (0-1)                                    |
| `expand_hops`     | number | 1        | Dependency graph expansion: 0=off, 1=direct imports, 2=transitive |

Falls back to standard semantic search if sparse vectors are not yet indexed (e.g., on older collections indexed before Phase 11).
```

**4. Benchmark Commands section — add init-corpus**
After the `ia-framework benchmark compare` block (around line 409), add a new subsection:

```bash
ia-framework benchmark init-corpus [options]
  --output <path>    Output path for corpus file (default: .ia-framework/benchmark-queries.json)
  --count <n>        Number of queries to generate (default: 20)
  --model <name>     Ollama model to use for generation (default: llama3.2 @ localhost:11434)
  --config <path>    Path to project.json
```

Generates a starter benchmark corpus by sampling indexed chunks from Qdrant and using a local Ollama LLM (`llama3.2` by default) to write natural language queries and expected files. If Ollama is unreachable on `localhost:11434`, the command prints a clear message suggesting `ollama pull llama3.2` and exits. Prevents accidentally running against the ia-framework repo itself — the target project path must differ from the framework directory.

**5. Benchmark Corpus section — update "Limitations" paragraph**
Find the Limitations subsection (around line 809) and update it:

Old:

```
The corpus is fully manual. There is no automatic generation from the codebase — you need to know your project well enough to write queries and their expected answers. This is intentional: the corpus defines what "correct retrieval" means for _your_ project, which requires human judgment.
```

New:

```
The corpus can be bootstrapped with `benchmark init-corpus`, which uses a local Ollama LLM to draft queries from sampled chunks. Treat the output as a starting point — review each query and expected file list to ensure they reflect real developer intent before using for metrics. The corpus still requires human judgment to be meaningful.
```

**6. search_codebase parameter table — update default threshold**
In the `### search_codebase` parameter table (around line 473), update `score_threshold` default from `0.5` to `0.3`:

Old:

```
| `score_threshold` | number | 0.5      | Minimum similarity score (0-1)                                    |
```

New:

```
| `score_threshold` | number | 0.3      | Minimum similarity score (0-1); tuned via MRR benchmark sweep     |
```

**7. CLI Reference — search command — update threshold default**
In the `ia-framework search` command block (around line 357), update the `--threshold` description:

Old:

```
  --threshold <n>    Min similarity score 0–1 (default: 0.5)
```

New:

```
  --threshold <n>    Min similarity score 0–1 (default: 0.3; MRR-tuned)
```

After making all edits, verify the README renders without broken markdown:

- No unclosed code fences
- Table columns align (pipes match)
- All new sections have correct heading levels
  </action>
  <verify>
  <automated>grep -n "search_codebase_hybrid\|init-corpus\|MRR-tuned\|prose-description\|0\.3.\*MRR\|Corpus generator" README.md | wc -l</automated>
  </verify>
  <done>README.md contains all 6 addition areas: hybrid tool in MCP table, hybrid tool detail section, init-corpus CLI block, updated Limitations paragraph, updated score_threshold defaults (search_codebase + CLI search). At least 8 lines matching the grep above.</done>
  </task>

<task type="auto">
  <name>Task 2: Commit README update and open GitHub PR</name>
  <files>README.md</files>
  <action>
**Step 1: Commit the README update**

```bash
git add README.md
git commit -m "docs: update README with Phase 11 MRR optimizations and corpus CLI"
```

**Step 2: Push the current branch to origin**

Current branch: `fix/readme-opencode-config-filename`

```bash
git push origin fix/readme-opencode-config-filename
```

**Step 3: Open a GitHub PR**

Use `gh pr create` with a clear title and body. The PR covers everything in the branch since it diverged from `main`:

- Phase 11: MRR optimization suite (hybrid search, prose embeddings, threshold tuning, benchmark corpus)
- Quick tasks: `benchmark init-corpus` CLI, Ollama corpus defaults + target project guard, dashboard live updates, stop-indexing capability
- Fixes: OpenCode config filename, README formatting, Qdrant/dashboard connection issues
- README update (this commit)

```bash
gh pr create \
  --title "v1.0 complete: Phase 11 MRR optimizations, corpus CLI, and doc updates" \
  --base main \
  --body "$(cat <<'EOF'
## Summary

This PR merges the completed v1.0 milestone into main, including Phase 11 MRR optimizations, new CLI tooling, and a fully updated README.

## Phase 11 — MRR Optimization

- **Hybrid search** (`search_codebase_hybrid` MCP tool): combines BM25 sparse vectors with dense semantic vectors, fused with Reciprocal Rank Fusion (RRF). Higher recall for exact-identifier queries.
- **Prose-description embeddings**: text vectors now embed a structured description (name, type, file, signature, docstring) instead of raw source — improves semantic match quality.
- **MRR-tuned score threshold**: default `score_threshold` lowered from 0.5 → 0.3 based on benchmark sweep across 0.3/0.4/0.5/0.6 (MRR=0.50 at 0.3–0.5; 0.46 at 0.6).
- **Benchmark corpus**: 30-query validated corpus for the ia-framework codebase itself.

## New CLI: Corpus Generator

- `ia-framework benchmark init-corpus` — generates a starter benchmark corpus using a local Ollama LLM to write queries from sampled indexed chunks.
- Defaults to `llama3.2` at `localhost:11434`; probes availability and suggests `ollama pull llama3.2` if unreachable.
- Guards against accidentally running against the ia-framework repo itself.

## Dashboard & UX

- **Live-updating dashboard**: polls every 2 seconds, reflects CLI-triggered indexing without refresh.
- **Stop indexing**: `ia-framework index-stop` + dashboard Stop button for graceful cancellation.
- **Ollama model selection**: switch embedding models at any time with `--model`; dimension discovery + collection migration handled automatically.

## Bug Fixes

- Fixed OpenCode config filename (`config.json` → `opencode.json`) in README and install script.
- Fixed Qdrant unreachable in dashboard container (service name resolution).
- Fixed dashboard not updating during CLI indexing (progress JSON polling).
- Fixed 32KB file size limit (tree-sitter upgrade).

## README

Updated to document all of the above — hybrid search tool, corpus CLI with Ollama defaults, updated default thresholds, and revised benchmark corpus guidance.
EOF
)"
```

After the PR is created, output the PR URL.
</action>
<verify>
<automated>gh pr list --state open | grep "v1.0 complete"</automated>
</verify>
<done>PR is open on GitHub targeting main, with title containing "v1.0 complete", body summarizing Phase 11 MRR optimizations, corpus CLI, Ollama defaults, and README update. PR URL printed to terminal.</done>
</task>

</tasks>

<verification>
After completion:
- `grep -c "search_codebase_hybrid" README.md` returns ≥ 3 (table row + detail section + description)
- `grep -c "init-corpus" README.md` returns ≥ 3 (CLI block + benchmarking section + corpus limitations)
- `grep "0\.3" README.md` shows updated threshold values in search_codebase table and CLI search block
- `gh pr list --state open` shows the PR targeting main
</verification>

<success_criteria>

- README.md updated with all 6 edit areas (hybrid tool, init-corpus CLI, updated thresholds, corpus limitations)
- README committed with descriptive message
- Branch pushed to origin
- GitHub PR open with clear title, summarized body, targeting main
  </success_criteria>

<output>
After completion, create `.planning/quick/260407-gjl-update-readme-md-with-phase-11-mrr-optim/260407-gjl-SUMMARY.md` with:
- What was changed in README (bullet list of sections updated)
- PR URL
- Commit SHA for the README commit
</output>
