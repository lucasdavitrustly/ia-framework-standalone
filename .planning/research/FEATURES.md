# Feature Landscape

**Domain:** AI-Assisted Development Framework with Local RAG
**Researched:** 2026-03-31
**Overall Confidence:** HIGH

## Executive Summary

The AI-assisted development tool market has converged on a clear set of table-stakes features: codebase awareness (via indexing or repo maps), multi-provider LLM support, and extensibility through MCP (Model Context Protocol). Every major tool (Cursor, Continue, Aider, Cody, OpenCode/Crush) provides these in some form. The differentiation opportunity for ia-framework lies in three areas that no competitor addresses well: (1) measurable RAG quality through end-to-end benchmarking, (2) observability into the RAG pipeline via a monitoring dashboard, and (3) configurable retrieval modes that can be empirically compared.

Research across five major tools reveals that codebase context quality is the single biggest determinant of AI code output quality. Tools approach this differently: Aider uses tree-sitter AST parsing with graph-ranked repo maps, Cursor uses embedding-based codebase indexing, Continue has deprecated built-in RAG in favor of custom RAG via MCP servers, and Cody leverages Sourcegraph's code search + code graph. ia-framework's approach of AST-aware indexing + Qdrant vector storage + dependency graph expansion is well-aligned with the state of the art and goes beyond what most tools offer.

---

## Table Stakes

Features users expect from any AI-assisted development tool. Missing any of these means the product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Codebase Indexing** | Every competitor (Cursor, Aider, Cody, Continue) provides some form of codebase awareness. This is the core value proposition. | HIGH | Aider uses tree-sitter AST + graph ranking. Cursor uses embedding-based indexing. Continue recommends custom RAG. All make code searchable. |
| **Semantic Search / Context Retrieval** | Developers need to query indexed code and get relevant results. Without retrieval, indexing is pointless. | MEDIUM | Continue recommends voyage-code-3 for embeddings. Cody uses keyword + code graph + Sourcegraph Search. Reranking (e.g. Voyage AI rerank-2) improves precision. |
| **MCP Server Integration** | MCP is the standard protocol for AI tool extensibility. Continue, OpenCode/Crush, and Cursor all support MCP natively. Continue's custom RAG guide explicitly uses MCP as the delivery mechanism. | MEDIUM | Continue's migration: deprecated @Codebase/@Docs context providers in favor of MCP tools + rules. This is the industry direction. |
| **Provider-Agnostic Embedding Support** | All tools support multiple LLM/embedding providers. Developers have strong opinions about providers (cost, privacy, local vs cloud). | MEDIUM | Continue recommends voyage-code-3 but supports any OpenAI-compatible API. Aider supports 20+ providers. OpenCode supports OpenAI, Anthropic, Google, Groq, Bedrock, local. Lock-in to one provider is unacceptable. |
| **Easy One-Shot Installation** | Every tool has frictionless setup. Aider: `pip install`. Continue: VS Code extension. OpenCode: `curl install`. Cursor: download app. | MEDIUM | ia-framework's `./install.sh` with auto-detection matches or exceeds competitor simplicity. Must handle Docker dependency gracefully. |
| **Project Profile Auto-Detection** | Aider auto-detects language via tree-sitter (supports 20+ languages). Cody detects repository structure. Developers don't want manual configuration. | MEDIUM | Detect: language, framework, package manager, test runner, build commands, project structure. Developer confirmation/correction UX matters. |
| **Configurable Settings** | All tools have project-level config files (`.aider.conf.yml`, `.opencode.json`, `.continue/config.yaml`, `.cursor/rules`). | LOW | ia-framework uses `.ia-framework/project.json`. Standard approach, nothing novel needed. |
| **Git-Aware Operations** | Aider is tightly integrated with git (auto-commits, change tracking). OpenCode tracks file changes per session. Standard expectation. | LOW | Framework should respect .gitignore for indexing, track file changes for incremental re-indexing. Not git auto-commit (that's the AI client's job). |

## Differentiators

Features that set ia-framework apart. Not expected by users, but create competitive advantage when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **AST-Aware Chunking** | Most tools use naive text chunking or file-level embedding. Aider's repo map uses tree-sitter for AST extraction with graph ranking. Continue's guide lists AST-based chunking as "most comprehensive but most complex." Understanding code structure (functions, classes, interfaces) produces dramatically better retrieval than text splitting. | HIGH | Use tree-sitter for language-agnostic AST parsing. Extract function/class/interface boundaries. Chunk at semantic boundaries, not arbitrary byte offsets. Aider proves this works at scale. |
| **Dependency Graph Expansion** | Unique to ia-framework's design. When retrieving a function, also pull its type signatures, imported interfaces, and utility functions it depends on. No competitor does this — Aider's repo map shows call signatures but doesn't expand on retrieval. Cody's "code graph" analyzes relationships but is Sourcegraph-dependent. | HIGH | Parse import statements, type references, function calls. Build a lightweight dependency graph during indexing. On retrieval, expand 1-2 hops to include dependencies. This is the "AI that actually understands the codebase" promise made real. |
| **Configurable Retrieval Modes (MCP vs Auto-Context)** | No competitor offers A/B testable retrieval modes. Cursor uses implicit context. Aider uses repo map + explicit file adds. ia-framework lets developers choose MCP-only (explicit queries), auto-context (prepended to prompts), or both — and benchmark which works better. | MEDIUM | MCP mode: developer explicitly asks for context via tool calls. Auto-context mode: framework intercepts prompts and prepends relevant code. Both mode: combines. Configurable and benchmarkable. |
| **End-to-End Benchmark System** | Only Aider has public benchmarks, but they test LLM capability (polyglot leaderboard: 225 Exercism exercises, measuring pass rate + cost). No tool benchmarks RAG configuration quality. ia-framework benchmarks whether changing the embedding model, chunking strategy, or retrieval mode actually improves AI code output (compile + test pass rate). | HIGH | Run coding tasks, measure: does the AI output compile? Do tests pass? Compare across embedding models, chunking strategies, retrieval modes. This is how developers trust and tune the system. Aider's benchmark approach (pass rate on real exercises) is the gold standard for methodology. |
| **Monitoring Dashboard** | No competitor has a dedicated monitoring UI for RAG health. Continue has basic telemetry. Aider tracks token costs in benchmark output. A dashboard showing indexing status, token consumption, and RAG quality metrics is entirely novel. | MEDIUM-HIGH | Docker-based dashboard. Shows: indexing progress, coverage stats, token usage trends, benchmark score history. This is the "control panel" that makes the invisible (RAG quality) visible. |
| **Benchmark History & Trend Visualization** | Extends the benchmark system with historical comparison. When developers tweak chunking or swap embedding models, they need to see if scores improved or regressed. No competitor offers this. | MEDIUM | Store benchmark runs with timestamps, config snapshots. Display trend lines in dashboard. Simple but powerful for iterative optimization. |
| **Auto-Context Injection** | Cursor does this implicitly (you can't control it). Aider's repo map is always-on context. Making it explicit, configurable, and measurable is novel. The developer chooses how context gets injected rather than it being a black box. | MEDIUM | Intercept prompts to AI client, run retrieval, prepend relevant code as context. Key difference from Cursor: transparency (developer sees what context was injected) and configurability (can disable, adjust retrieval depth). |
| **GSD Workflow Integration** | Extending structured AI development workflows (planning → research → execution) with automatic RAG context. No competitor integrates with structured development methodology. | MEDIUM | At planning phase: inject architectural context. At execution phase: inject relevant code. The framework bridges "how to build" (GSD) with "what exists" (RAG). |
| **Database Schema as Context** | Developer provides DB connection during install. Framework indexes schema (tables, columns, types, relationships) and makes it available as context. Some tools have DB MCP servers, but baked-in schema awareness during indexing is novel. | MEDIUM | Read-write DB connection. Index schema metadata. Include relevant tables/columns when AI is working on data layer code. Prevents AI from generating queries against non-existent columns. |

## Anti-Features

Features to explicitly NOT build. These would waste effort or conflict with the framework's architecture.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Own IDE / Editor** | OpenCode/Crush is the primary interface. Cursor, Continue, and Cody are all IDE-centric. ia-framework provides infrastructure, not a coding UI. Building an editor fragments effort and competes with the tool we integrate with. | Provide MCP servers and auto-context injection that work with OpenCode/Crush and potentially other AI clients. |
| **Code Completion / Autocomplete** | This is the AI client's responsibility. Cursor, Continue, and Cody all handle autocomplete. Duplicating this in the framework creates confusion about what generates suggestions. | Focus on making the AI client's completions better by providing superior context. |
| **Own Chat Interface** | OpenCode/Crush has a full TUI chat interface with session management, multi-model support, and keyboard shortcuts. Building another chat UI is redundant. | Enhance the existing chat experience through better context, not a parallel interface. |
| **Multi-Tenancy / Authentication** | This is an internal developer tool. No auth system, no team management, no OAuth. Adding this bloats the product for zero initial value. | Single-user, local-only deployment. Git clone + install script. Defer team features to v2+. |
| **npm Package / Binary Distribution** | Git clone + `./install.sh` is sufficient for internal use. npm publishing, binary releases, and homebrew taps add maintenance burden. | Distribute as a git repo. Simple, auditable, forkable. |
| **Proactive Task Suggestion** | "I noticed you should fix X" is intrusive and unreliable without deep understanding. Aider and Cursor are reactive (user asks, AI responds). Proactive agents are still unreliable. | Be responsive to explicit queries and workflow steps. Don't interrupt the developer. |
| **Full TDD Enforcement on Target** | The framework itself follows TDD, but enforcing TDD on the target project is opinionated and creates friction. Defer to v2. | Index and use existing tests as context. Don't mandate test-first for the target project. |

## Feature Dependencies

```
Installation Script
  └── Project Profile Auto-Detection
        └── Developer Confirmation UX
              └── Codebase Indexing (core)
                    ├── AST-Aware Chunking (tree-sitter)
                    │     └── Dependency Graph Construction
                    ├── Embedding Generation (provider-agnostic)
                    │     └── Qdrant Vector Storage
                    └── Incremental Re-Indexing (git-aware)

Codebase Indexing (core)
  ├── Semantic Search / Retrieval
  │     ├── MCP Server (explicit queries)
  │     │     └── MCP Tools (search_codebase, get_file, get_dependencies)
  │     ├── Auto-Context Injection (implicit context)
  │     │     └── Configurable Retrieval Modes
  │     └── Dependency Graph Expansion (on retrieval)
  │
  ├── Benchmark System
  │     ├── Task Runner (coding exercises)
  │     ├── Compile/Test Pass Rate Measurement
  │     ├── Config Comparison (embedding model × chunking × retrieval mode)
  │     └── Benchmark History Storage
  │
  └── Database Schema Indexing (optional)
        └── DB Connection (developer-provided)

Monitoring Dashboard (Docker)
  ├── Indexing Status Display
  ├── Token Usage Tracking
  ├── Project Profile View
  └── Benchmark History Visualization
        └── Benchmark System (data source)

GSD Workflow Integration
  ├── RAG Context at Planning Steps
  └── RAG Context at Execution Steps
        └── Semantic Search / Retrieval
```

## MVP Recommendation

**Prioritize the core pipeline — the shortest path from install to "AI that understands my codebase":**

1. **Installation Script + Project Detection** — First-run experience. Must work reliably or users bounce.
2. **Codebase Indexing (AST-aware + Qdrant)** — The foundational differentiator. Without this, nothing else matters.
3. **Semantic Search via MCP Server** — The integration point with OpenCode/Crush. Proves the system works.
4. **Benchmark System (basic)** — Prove that the RAG configuration matters. Even CLI-only benchmarks are valuable before the dashboard exists.

**Defer to later phases:**

| Feature | Reason to Defer |
|---------|----------------|
| **Auto-Context Injection** | MCP-only mode is simpler to build and test. Auto-context adds complexity (prompt interception, context window management). Build after MCP proves the retrieval quality. |
| **Monitoring Dashboard** | CLI output for indexing status and benchmark results is sufficient initially. Dashboard is a polish feature. |
| **Benchmark Visualization** | Requires dashboard. CLI benchmark comparison (table output) works for early optimization. |
| **GSD Workflow Integration** | Build the RAG quality first, then integrate with workflows. The RAG value is independent of GSD. |
| **Database Schema Indexing** | Useful but secondary to code context. Add when the core pipeline is solid. |
| **Dependency Graph Expansion** | Valuable but complex. Start with semantic search only, add graph expansion as a measured improvement (benchmark it!). |

## Competitive Landscape Summary

| Feature Area | Cursor | Continue | Aider | Cody/Sourcegraph | OpenCode/Crush | ia-framework |
|-------------|--------|----------|-------|------------------|----------------|-------------|
| Codebase Indexing | Embedding-based | Deprecated (→ custom RAG) | Tree-sitter repo map | Sourcegraph Search + Code Graph | None (relies on MCP) | AST-aware + Qdrant |
| MCP Support | Yes | Yes (primary) | No | No | Yes | Yes (primary) |
| Retrieval Approach | Implicit (black box) | Via MCP tools | Repo map + explicit /add | Keyword + graph + search API | Via MCP tools | MCP + auto-context (configurable) |
| Benchmarking | None | None | LLM polyglot leaderboard | None | None | RAG config benchmarking |
| Monitoring | None | Basic telemetry | Token cost in benchmarks | None | None | Dashboard (indexing, tokens, RAG quality) |
| Installation | Download app | Extension install | pip install | Extension install | curl/brew | ./install.sh (auto-detect) |
| Workflow Integration | Agent mode | Agent + plan mode | Architect/code/ask modes | Chat + prompts | Custom commands | GSD workflow + RAG |
| Provider-Agnostic | Limited | Yes | Yes (20+) | Limited | Yes | Yes |
| Local/Private | No (cloud) | Yes (Ollama) | Yes (Ollama) | No (Sourcegraph) | Yes (local endpoint) | Yes (Ollama + cloud) |

## Sources

- **Aider** — Repository map architecture: https://aider.chat/docs/repomap.html [HIGH confidence — official docs]
- **Aider** — LLM leaderboards & benchmark methodology: https://aider.chat/docs/leaderboards/ [HIGH confidence — official docs, October 2025 data]
- **Continue** — Custom code RAG guide (embeddings, chunking, MCP): https://docs.continue.dev/guides/custom-code-rag [HIGH confidence — official docs]
- **Continue** — Codebase/documentation awareness migration: https://docs.continue.dev/guides/codebase-documentation-awareness [HIGH confidence — official docs]
- **Continue** — MCP server integration: https://docs.continue.dev/customize/mcp-tools [HIGH confidence — official docs]
- **Cody/Sourcegraph** — Context architecture (keyword + graph + search): https://sourcegraph.com/docs/cody/core-concepts/context [HIGH confidence — official docs]
- **OpenCode** — Features, MCP, LSP, architecture: https://github.com/opencode-ai/opencode [HIGH confidence — official repo, archived Sep 2025, now Crush]
