# Pitfalls Research

**Domain:** AI-assisted development framework with local RAG for code
**Researched:** 2026-03-31
**Confidence:** HIGH (Qdrant docs, MCP specification, Tree-sitter docs, Qdrant code search tutorial)

## Critical Pitfalls

### Pitfall 1: Naive Text Chunking Destroys Code Retrieval Quality

**What goes wrong:**
Using generic text chunking (fixed character/token windows) on source code produces chunks that split functions mid-body, separate type definitions from their usage, and lose the structural context that makes code meaningful. Search results return half-functions and broken syntax that confuse the LLM more than help it.

**Why it happens:**
Teams apply standard RAG patterns from document search (split by paragraphs/tokens, overlap by 10-20%) to code without recognizing that code has formal structure. A 512-token window might cut a function at line 15 of 30, putting the return type in one chunk and the return statement in another.

**How to avoid:**
Use AST-aware chunking via Tree-sitter (or LSP-based parsing). Chunk at semantic boundaries: functions, methods, classes, structs, enums. Qdrant's own code search tutorial explicitly uses LSP/LSIF parsing to extract chunks at function-level granularity, with metadata (module, file, struct name, signature, docstring). Each chunk must be a self-contained, syntactically valid code unit with its context.

For the ia-framework specifically:
- Parse with Tree-sitter using language-specific grammars
- Extract: function/method body, signature, docstring, containing class/module, file path
- Store metadata as Qdrant payload for filtering
- Keep chunks at function/method granularity — not too small (loses meaning) and not too large (exceeds embedding model context window)

**Warning signs:**
- Retrieved code snippets contain syntax errors or incomplete constructs
- Search results return the wrong half of a function (e.g., setup code without the logic)
- Developers report that RAG context "doesn't help" or "confuses the AI"
- Benchmark scores don't improve when indexing more code

**Phase to address:**
Core indexing pipeline phase — this must be right from the first implementation. No point building MCP server or dashboard if the underlying chunks are garbage.

**Sources:** Qdrant code search tutorial (https://qdrant.tech/documentation/tutorials-search-engineering/code-search/), Tree-sitter documentation. Confidence: HIGH.

---

### Pitfall 2: Single Embedding Model Misses Half the Queries

**What goes wrong:**
Using only a general NLP embedding model (like `all-MiniLM-L6-v2`) fails on code-to-code queries. Using only a code embedding model (like `jina-embeddings-v2-base-code`) fails on natural language queries like "how do I handle authentication?". Either choice loses ~40% of useful results.

**Why it happens:**
NLP models understand natural language descriptions but don't understand code syntax. Code models understand structural similarity but miss the semantic intent behind natural language queries. Qdrant's code search demo proved this: NLP search returns function signatures matching the query's intent, while code search returns implementation-level matches. Both are needed.

**How to avoid:**
Use dual-vector collections in Qdrant — store both a "text" vector (code converted to natural language description) and a "code" vector (raw code) for each chunk. Query both vectors and merge results. Qdrant natively supports named vectors per point, so a single collection can hold both.

For code-to-text conversion:
- Extract function signature, split camelCase/snake_case into words
- Include docstring/comments
- Add context (module name, file name, class name)
- Build a sentence: "Function {name} that does {docstring} defined as {signature} in {context}"

**Warning signs:**
- Developers phrase queries as code snippets but get irrelevant NL-matched results (or vice versa)
- Retrieval precision is good for "find function X" but bad for "how does the app handle Y"
- Only one type of query style produces useful results

**Phase to address:**
Embedding/indexing pipeline phase. Must be designed into the collection schema from the start — adding a second vector later requires full re-indexing.

**Sources:** Qdrant dual-vector code search tutorial (https://qdrant.tech/documentation/tutorials-search-engineering/code-search/). Confidence: HIGH.

---

### Pitfall 3: Embedding Model Mismatch Silently Degrades Results

**What goes wrong:**
The distance function configured in Qdrant doesn't match what the embedding model was trained for. Or the vector dimensions don't match. Or switching embedding providers doesn't trigger re-indexing, leaving mixed vectors in the collection. Results look plausible but are subtly wrong — the most dangerous failure mode.

**Why it happens:**
Provider-agnostic embedding support means developers can switch models. But switching models means:
1. Different vector dimensions (1536 for OpenAI, 768 for MiniLM, 4096 for some code models)
2. Different distance metrics (some models optimize for cosine, others for dot product)
3. Vectors from model A are meaningless when searched with model B's query vector

Qdrant won't error if you search a cosine collection with vectors that were trained for dot product — it will just return wrong results silently.

**How to avoid:**
- Lock collection to a specific model configuration. Store model name + version in Qdrant payload metadata.
- When the user changes embedding provider, FORCE full re-indexing. Delete and recreate the collection.
- Validate vector dimensions match collection schema before upsert.
- Default to Cosine distance (most general-purpose models use it) but document which models need other metrics.
- Store embedding model config in `.ia-framework/project.json` and check on every startup.

**Warning signs:**
- Search results seem random or unrelated to queries
- Retrieval precision drops suddenly without code changes
- Collection has points with different vector sizes (Qdrant will reject these, but mixed model sources with same dimensions won't be caught)

**Phase to address:**
Embedding pipeline phase — implement model version tracking from day one. Re-indexing flow must be built alongside initial indexing.

**Sources:** Qdrant retrieval quality tutorial (https://qdrant.tech/documentation/tutorials-search-engineering/retrieval-quality/), Qdrant embedding model migration tutorial. Confidence: HIGH.

---

### Pitfall 4: Auto-Context Injection That Adds Wrong Context Is Worse Than None

**What goes wrong:**
The auto-context mode prepends retrieved code to every prompt, including prompts where the context is irrelevant, wrong, or overwhelming. The LLM follows the injected context patterns even when they don't apply, producing code that matches the wrong style, uses wrong dependencies, or implements the wrong pattern. Token costs spike. Developer trust drops.

**Why it happens:**
Auto-context treats every prompt equally. A query about "add a button to the settings page" gets the same retrieval pipeline as "what's the Node.js version?" or "refactor this function." Without relevance scoring/thresholds, every prompt gets 3-5 code chunks injected regardless of whether they're useful.

**How to avoid:**
- Implement a relevance threshold: if the best match score is below threshold, inject nothing.
- Classify prompts: some prompts are "code generation" (benefit from context), some are "general questions" (don't).
- Make auto-context configurable: developers should be able to set aggressiveness (always/smart/never).
- Show developers WHAT context was injected (transparency) — dashboard or inline indicators.
- The MCP-only mode should be the default initially — let developers explicitly request context before auto-injecting it.
- Benchmark MCP-only vs auto-context vs both to find the sweet spot (PROJECT.md already plans this).

**Warning signs:**
- Developers disable auto-context because "it keeps adding irrelevant stuff"
- Token usage spikes without corresponding quality improvement
- Generated code includes imports/patterns from unrelated parts of the codebase
- Benchmark scores are LOWER with auto-context than without

**Phase to address:**
Context retrieval + MCP integration phase. Build MCP-only mode first, add auto-context later with scoring thresholds. The benchmarking system must exist before auto-context is tuned.

---

### Pitfall 5: Stale Index After Code Changes Poisons Context

**What goes wrong:**
Developer modifies or deletes code, but the Qdrant index still contains the old version. RAG retrieves deleted functions, outdated patterns, or deprecated APIs. The LLM generates code based on the stale context — code that doesn't compile because it references things that no longer exist.

**Why it happens:**
Initial indexing is a one-shot operation. Without incremental re-indexing triggered by file changes, the index diverges from the codebase over time. In an active development project, this divergence happens within hours.

**How to avoid:**
- Implement file-watcher-triggered incremental re-indexing (watch for git changes or filesystem events).
- At minimum, support manual re-index command that's fast enough to run frequently.
- Use file hash or git commit SHA as version metadata on each point — detect stale points by comparing to current state.
- Tree-sitter's incremental parsing helps here: it can efficiently re-parse only changed portions.
- Consider git-hook integration: re-index on post-commit or post-checkout.
- Design the indexing pipeline for upsert (update existing points) not just insert.

**Warning signs:**
- LLM generates code using old function signatures that have been refactored
- RAG returns results from deleted files
- Developers lose trust: "the AI doesn't know about my latest changes"
- Growing divergence between codebase state and search results over time

**Phase to address:**
Must be designed in the indexing pipeline phase, but the incremental update mechanism can be a separate, later phase. At minimum, fast full re-index (< 2 minutes for a large project) should be available from the start.

---

### Pitfall 6: MCP Server Crashes Silently Kill the Developer Workflow

**What goes wrong:**
The MCP server process crashes, hangs, or loses its STDIO connection. OpenCode doesn't get an error — it just gets no response. The developer's AI interaction silently degrades to context-free mode without any notification that RAG is offline.

**Why it happens:**
MCP over STDIO has a fundamental fragility: the server is a child process. If it crashes, the STDIO pipe closes. The MCP specification notes that ping timeouts "should be treated as connection failures" and "multiple failed pings may trigger a connection reset." But many hosts don't implement aggressive health checking.

Common crash causes for this project:
- Qdrant Docker container isn't running / crashed
- Embedding API rate limits or network errors during query-time embedding
- Memory issues from loading large embedding models locally (Ollama)
- Unhandled promise rejections in the TypeScript server

**How to avoid:**
- Wrap all Qdrant calls with timeout + retry + circuit breaker pattern.
- Log ALL MCP server errors to stderr (MCP spec allows this) AND to a persistent log file.
- Health check endpoint: MCP server should verify Qdrant is reachable on startup and periodically.
- Graceful degradation: if Qdrant is down, return empty results with an error message, don't crash.
- Implement MCP Logging primitive: send diagnostic messages to the client for visibility.
- Test MCP server against: Qdrant down, embedding API unreachable, malformed queries, very large payloads.

**Warning signs:**
- MCP tool calls return nothing without error messages
- Developer manually restarts OpenCode to "fix" RAG
- Server logs show unhandled exceptions
- Qdrant container memory usage climbs without bound

**Phase to address:**
MCP server implementation phase. Error handling and graceful degradation must be built into the first version, not bolted on later.

**Sources:** MCP specification (https://modelcontextprotocol.io/docs/concepts/architecture), MCP ping/error handling spec. Confidence: HIGH.

---

### Pitfall 7: Dependency Graph Expansion Explodes Context Size

**What goes wrong:**
Semantic search finds a relevant function, then dependency graph expansion follows its imports to find types, interfaces, and utilities. But those have their own dependencies, and those have theirs. The expansion produces 50+ code chunks, exceeding the LLM's context window or drowning the actual query in noise.

**Why it happens:**
Large codebases have deep dependency trees. A single service function might import from a repository layer, which imports from an ORM, which imports from a database client. Following imports naively (even to depth 2) can generate hundreds of related code chunks. Barrel files (`index.ts` re-exports) make this worse — a single import from `index.ts` appears to depend on everything the module exports.

**How to avoid:**
- Set hard depth limit (1 hop is usually sufficient for direct dependencies).
- Prioritize TYPE dependencies (interfaces, types) over implementation dependencies.
- Filter out barrel files / re-exports — resolve to actual source files.
- Cap total expanded context size (e.g., max 8K tokens of dependency context per query).
- Weight dependency relevance by specificity: a custom type definition > a utility function > a third-party library type.
- Detect and break circular dependency chains during expansion.

**Warning signs:**
- Context injection adds 20+ files to a single query
- Token usage per query exceeds reasonable bounds (>15K tokens of context)
- Expanded context includes standard library or node_modules types
- Response time for context retrieval exceeds 2-3 seconds

**Phase to address:**
Advanced retrieval phase (after basic semantic search works). The dependency graph feature is a refinement, not a prerequisite. Ship basic semantic search first.

---

### Pitfall 8: Benchmark System Measures the Wrong Thing

**What goes wrong:**
The benchmark system measures retrieval precision (did we find the right chunks?) but not end-to-end quality (did the AI produce code that compiles and passes tests?). Teams optimize for retrieval metrics while actual developer experience doesn't improve. Or benchmarks use synthetic/toy tasks that don't represent real development work.

**Why it happens:**
Retrieval metrics (precision@k, recall@k) are easy to compute and well-understood from information retrieval literature. End-to-end metrics (compile rate, test pass rate) require actually running the generated code, which is complex and slow. Teams take the easy path.

**How to avoid:**
- The PROJECT.md already specifies end-to-end benchmarks (compile/test pass rate) — hold to this.
- Build the benchmark runner to: (1) present a coding task, (2) let the LLM generate code with RAG context, (3) compile the result, (4) run tests, (5) record pass/fail.
- Create a curated set of benchmark tasks FROM the actual target project — not generic coding problems.
- Benchmark tasks should include: "add a feature similar to X", "fix bug Y", "refactor Z" — realistic developer activities.
- Track BOTH retrieval metrics AND end-to-end metrics. They should correlate — if they don't, something is wrong.
- Benchmark without RAG as a baseline — the delta shows RAG's actual contribution.
- Run benchmarks across different embedding models/chunking strategies as planned.

**Warning signs:**
- Retrieval precision is 95%+ but developers say RAG doesn't help
- Benchmark tasks are too simple to exercise real RAG value (single-file changes)
- No baseline comparison (RAG vs no-RAG)
- Benchmark scores improve but developer satisfaction doesn't
- Benchmarks take so long nobody runs them

**Phase to address:**
Benchmark system phase — must be implemented AFTER basic RAG pipeline works but BEFORE tuning retrieval parameters. You need measurement before optimization.

---

### Pitfall 9: Installer Assumes Too Much About Developer Environment

**What goes wrong:**
The `./install.sh` script fails on common developer setups: Docker Desktop not installed or not running, Docker permission issues (rootless vs rootful), wrong Node.js version, macOS filesystem warnings from Qdrant, corporate proxy blocking Docker pulls, or simply not enough disk space for embedding models.

**Why it happens:**
"One-shot installer" implies it works everywhere with no prior setup. In reality, the prerequisites (Docker, Node.js, possibly Ollama) have their own installation complexity. Each OS (macOS, Linux, WSL) has different Docker configurations. The installer tries to be smart but can't anticipate every environment.

Specific Qdrant concern: Qdrant's own troubleshooting docs warn that HFS/HFS+ (macOS default filesystem) is "untested" and may produce warnings. FUSE filesystems can cause data corruption.

**How to avoid:**
- Check prerequisites BEFORE doing anything: Docker running? Correct version? Sufficient disk space? Network access?
- Fail fast with clear messages: "Docker is not running. Please start Docker Desktop and try again."
- Use Docker named volumes (not bind mounts) for Qdrant storage — avoids filesystem compatibility issues.
- Set Docker ulimits explicitly: `docker run --ulimit nofile=10000:10000` (Qdrant's own recommendation for "too many files open" errors).
- Make the installer idempotent: running it again should fix problems, not create new ones.
- Test on: macOS (Apple Silicon + Intel), Ubuntu, WSL2 on Windows.
- Separate "check environment" from "install" — let users run a pre-flight check.
- Provide manual setup instructions as fallback when the script fails.

**Warning signs:**
- Users report install failures on first try
- Install works on developer's machine but fails in CI or on teammates' machines
- Qdrant container crashes after restart with filesystem errors
- Docker pulls fail silently behind corporate proxy

**Phase to address:**
Installer phase — this is the first thing users interact with. A broken installer means zero adoption. Design it with pre-flight checks from day one.

**Sources:** Qdrant troubleshooting docs (https://qdrant.tech/documentation/operations/common-errors/). Confidence: HIGH.

---

## Moderate Pitfalls

### Pitfall 10: Ollama Local Embedding Makes Initial Indexing Unacceptably Slow

**What goes wrong:**
Using Ollama for local embeddings means no API costs, which is attractive. But embedding a large codebase (10K+ functions) locally on CPU takes hours. Developers abandon the setup during initial indexing.

**Prevention:**
- Show progress during indexing with time estimates
- Support cloud embedding APIs for initial bulk indexing, then switch to Ollama for incremental updates
- Batch embeddings efficiently (Ollama supports batch inference)
- Default to a smaller, faster embedding model for first-time setup; offer re-indexing with higher-quality model later
- Allow indexing to happen in background — framework should be usable immediately with partial index

---

### Pitfall 11: Qdrant Collection Schema Lock-in

**What goes wrong:**
The collection is created with specific vector dimensions. When the team wants to try a different embedding model with different dimensions, they must delete and recreate the collection, losing all indexed data.

**Prevention:**
- Design for model migration from the start: store all chunks and metadata in a format that allows re-embedding
- Keep the original source data (file paths, AST positions) in the Qdrant payload or a separate store so re-indexing is always possible from source
- Follow Qdrant's embedding model migration tutorial pattern
- Document the "switch model" workflow as a first-class operation

---

### Pitfall 12: Tree-sitter Grammar Coverage Gaps

**What goes wrong:**
Tree-sitter has excellent support for mainstream languages (TypeScript, Python, Rust, Go, Java) but may have incomplete or buggy grammars for niche languages, framework-specific syntax (JSX, Vue SFCs, Svelte), or generated code. The parser produces ERROR nodes instead of valid AST, and the chunking pipeline doesn't handle this gracefully.

**Prevention:**
- Tree-sitter error recovery is robust (it wraps errors in ERROR nodes and continues parsing) — detect and handle ERROR nodes explicitly
- For unsupported languages, fall back to heuristic chunking (split on function/class keywords)
- Start with the target project's specific language(s) and add others incrementally
- Test parsing against the actual target codebase, not synthetic examples
- Skip generated files, vendor directories, node_modules, build artifacts

---

### Pitfall 13: MCP Tool Schema Design Affects LLM Effectiveness

**What goes wrong:**
The MCP tools are defined with vague names, missing descriptions, or overly complex input schemas. The LLM struggles to decide when and how to use them. The tool might exist but the LLM never calls it, or calls it with wrong arguments.

**Prevention:**
- Use clear, specific tool names: `search_codebase` not `query` or `find`
- Write detailed descriptions optimized for LLM understanding — describe WHEN to use the tool, not just WHAT it does
- Keep input schemas simple: 1-3 parameters max per tool
- Include example argument values in the description
- Test tools with multiple LLMs — different models interpret schemas differently
- Use the `title` field (MCP specification supports it) for human-readable display names

**Sources:** MCP specification tool discovery section. Confidence: HIGH.

---

### Pitfall 14: Dashboard Becomes a Maintenance Burden

**What goes wrong:**
The monitoring dashboard starts as a simple status viewer but accumulates features (benchmark visualization, trend charts, configuration UI) until it becomes a significant maintenance burden. Frontend framework updates, build pipeline complexity, and API surface growth consume time that should go to RAG quality.

**Prevention:**
- Keep the dashboard read-only for v1 — display data, don't allow configuration through it
- Use a minimal tech stack (plain HTML + lightweight chart library, or a React SPA with minimal deps)
- Dashboard should be optional — all functionality must work without it
- Consider server-side rendered pages over a full SPA to reduce frontend complexity
- Benchmark data should be stored in a format (JSON files or SQLite) that can be inspected without the dashboard

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip dual-vector (text+code), use single embedding model | Simpler indexing pipeline, one model to manage | ~40% worse retrieval for one query type (NL or code) | Never for final product — acceptable for initial prototype to validate pipeline |
| Hard-code embedding model instead of provider-agnostic | Faster to ship, no abstraction overhead | Locked to one provider, re-indexing nightmare when switching | Only for MVP if team has already chosen the model |
| Skip incremental re-indexing, require full re-index | Much simpler indexing code | Developer friction grows daily as codebase changes | Acceptable for v1 if full re-index is fast (<2 min) |
| No relevance threshold on auto-context | Every query gets context, simpler logic | Token waste, noise injection, developer distrust | Never — always have a minimum score threshold |
| Embed entire files instead of AST-parsed functions | No parsing complexity | Terrible retrieval quality, large chunks overflow context windows | Never |
| Skip benchmark baseline (no-RAG comparison) | Faster to ship benchmarks | Can't prove RAG actually helps, can't detect regressions | Only temporarily during benchmark development |
| Use bind mounts instead of Docker volumes for Qdrant | Easier to inspect data on host | Filesystem compatibility issues (macOS HFS, WSL) | Never — always use named Docker volumes |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Qdrant Docker | Using bind mounts on macOS/WSL | Use named Docker volumes; set `--ulimit nofile=10000:10000` |
| Qdrant collection | Creating collection before knowing embedding model dimensions | Initialize collection lazily on first embedding, using model's reported dimensions |
| Tree-sitter WASM | Loading grammars synchronously blocking Node.js event loop | Load grammars async on startup; cache compiled WASM grammars |
| OpenCode MCP | Logging to stdout (conflicts with STDIO transport) | Log to stderr only; use MCP Logging primitive for client-visible messages |
| Ollama API | Assuming Ollama is always available on localhost:11434 | Check Ollama availability at startup; provide clear error if not running; support configurable host |
| Embedding APIs | Not handling rate limits / network errors | Implement exponential backoff, circuit breaker, and request queuing |
| Docker Compose | Hardcoding port numbers | Use environment variables for ports; detect conflicts on common ports (6333, 6334, 3000) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Embedding every file change immediately | CPU spikes, Ollama OOM, queue backup | Debounce file changes, batch re-embeddings every 30s-1min | >10 file saves per minute (normal editing) |
| Loading entire dependency graph into memory | Memory grows linearly with codebase size | Lazy-load dependencies on query, don't pre-compute full graph | Codebase >5000 files |
| Qdrant HNSW index in RAM for large collections | RAM usage exceeds container limits | Use on_disk HNSW + scalar quantization for collections >100K points | >100K code chunks (~large monorepo) |
| Synchronous embedding in MCP tool handler | 2-5 second latency per query with local models | Pre-embed common queries; use async embedding with streaming response | Any usage with Ollama embeddings |
| Full codebase re-index on every startup | 5-30 minute startup time for large projects | Persist index in Docker volume; only re-index changed files | Codebase >1000 files |
| Unbounded context injection size | Exceeds LLM context window, prompt truncation | Hard cap on injected context tokens (e.g., 4K-8K max) | Queries matching many code chunks |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Indexing `.env` files, secrets, credentials | Secrets retrievable via semantic search; could be injected into AI prompts and visible in logs | Respect `.gitignore`; add `.ia-framework-ignore` for additional exclusions; never index `.env`, `*.pem`, `*.key` |
| MCP server exposes write access to Qdrant | Malicious prompt injection could delete/modify the index | MCP server should only have read access to Qdrant; separate admin API for indexing |
| Database connection string stored in plain text | Credentials accessible to anyone with repo access | Use environment variables or OS keychain; never store in `.ia-framework/project.json` |
| Embedding API keys in configuration files | API key leak via git | Use environment variables; `.ia-framework/` should be in `.gitignore` for sensitive config |
| No input sanitization on MCP tool parameters | Injection attacks via crafted search queries | Sanitize/validate all MCP tool inputs before passing to Qdrant client |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No feedback during initial indexing | Developer thinks install is broken, kills the process | Show progress bar with file count, estimated time, current file being indexed |
| Silent RAG failures (no context but no error) | Developer gets worse AI output without knowing why | Surface RAG status in MCP response: "Found 3 relevant code chunks" or "No relevant code found" |
| Requiring manual re-index after code changes | Developer forgets, gets stale context, loses trust | At minimum: remind on startup if index is >1 hour old; ideally: auto-detect changes |
| Complex configuration with many options | Developer spends 30 minutes configuring before seeing value | Sensible defaults that work without configuration; advanced options for power users |
| Benchmark results only visible in dashboard | Need to launch Docker, open browser, navigate to see if RAG improved | Also output benchmark summary to terminal; dashboard for trends/details |
| No way to see what context was injected | Developer can't debug why AI gave wrong answer | Include injected context sources in MCP response metadata; log to file |

## "Looks Done But Isn't" Checklist

- [ ] **Indexing pipeline:** Often missing handling of very large files (>10K lines) — verify chunking works on the largest files in the target project
- [ ] **Indexing pipeline:** Often missing binary file detection — verify it skips images, compiled files, lock files
- [ ] **MCP server:** Often missing graceful shutdown — verify SIGTERM/SIGINT handlers clean up Qdrant connections
- [ ] **MCP server:** Often missing concurrent request handling — verify two rapid tool calls don't corrupt shared state
- [ ] **Auto-context:** Often missing relevance threshold — verify it doesn't inject context for unrelated queries
- [ ] **Installer:** Often missing idempotency — verify running install.sh twice doesn't break the setup
- [ ] **Installer:** Often missing cleanup on failure — verify partial installs can be recovered by re-running
- [ ] **Benchmark system:** Often missing baseline comparison — verify there's a "no RAG" baseline to compare against
- [ ] **Dashboard:** Often missing error state displays — verify dashboard shows meaningful state when Qdrant is down
- [ ] **Docker setup:** Often missing volume persistence — verify Qdrant data survives container restart
- [ ] **Dependency graph:** Often missing cycle detection — verify circular imports don't cause infinite loops

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Naive text chunking deployed | HIGH | Must rewrite chunking pipeline AND re-index everything; all benchmark history invalidated |
| Wrong embedding model/dimensions | MEDIUM | Delete collection, recreate with correct schema, re-index. Data loss is the index only — source code is unchanged |
| Stale index poisoning context | LOW | Run full re-index (should take <5 min for reasonably sized project). Add incremental update mechanism |
| MCP server crash loop | LOW | Fix the error, restart. But investigate root cause — usually Qdrant connection or embedding API failure |
| Auto-context injecting noise | LOW | Lower relevance threshold or switch to MCP-only mode immediately. Fine-tune threshold with benchmarks |
| Installer fails mid-setup | MEDIUM | Must identify what was partially installed, clean up, fix prerequisites, re-run. Idempotent installer prevents this |
| Benchmark measures wrong thing | MEDIUM | Must design new end-to-end benchmark tasks, rebuild runner. Previous benchmark data is useless for comparison |
| Qdrant filesystem corruption | HIGH | Recreate Docker volume, re-index from scratch. Use named volumes to prevent this |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Naive text chunking (#1) | AST-aware indexing pipeline | Parse target project, inspect chunks manually, verify each is syntactically valid |
| Single embedding model (#2) | Indexing pipeline + collection design | Create dual-vector collection, query with both NL and code queries, compare results |
| Embedding model mismatch (#3) | Indexing pipeline + config management | Switch model in config, verify re-index is forced, verify old points are replaced |
| Wrong auto-context (#4) | Context injection mode (after MCP) | Run queries with auto-context on/off, compare LLM output quality, benchmark both |
| Stale index (#5) | Indexing pipeline (incremental update) | Modify a function, verify re-index captures changes within <5 minutes |
| MCP server crashes (#6) | MCP server implementation | Kill Qdrant mid-query, verify MCP returns error not crash; test with Qdrant down |
| Dependency explosion (#7) | Advanced retrieval (after basic search) | Query a deeply-connected function, verify expansion stays within token budget |
| Wrong benchmarks (#8) | Benchmark system | Run benchmark with broken RAG, verify score drops; run without RAG, verify baseline |
| Installer failures (#9) | Installer implementation | Test on clean macOS, Ubuntu, WSL2; test with Docker stopped; test with wrong Node version |
| Slow Ollama indexing (#10) | Indexing pipeline | Time initial index with Ollama on target project; if >10 min, add cloud API fallback |
| Collection schema lock-in (#11) | Collection + indexing design | Switch embedding model, verify re-index workflow works end-to-end in <5 steps |
| Tree-sitter gaps (#12) | Parsing pipeline | Parse every file in target project, count ERROR nodes, verify fallback chunking works |
| Bad MCP tool schema (#13) | MCP server implementation | Test with 3+ different LLMs; verify tool gets called correctly on representative prompts |
| Dashboard bloat (#14) | Dashboard implementation | Keep feature list to: status, benchmarks, token usage. Say no to config UI in v1 |

## Sources

- Qdrant Semantic Search for Code tutorial: https://qdrant.tech/documentation/tutorials-search-engineering/code-search/ (HIGH confidence)
- Qdrant Retrieval Quality Evaluation tutorial: https://qdrant.tech/documentation/tutorials-search-engineering/retrieval-quality/ (HIGH confidence)
- Qdrant Troubleshooting / Common Errors: https://qdrant.tech/documentation/operations/common-errors/ (HIGH confidence)
- Qdrant Optimization guide: https://qdrant.tech/documentation/tutorials/optimize (HIGH confidence)
- MCP Architecture specification: https://modelcontextprotocol.io/docs/concepts/architecture (HIGH confidence)
- MCP Ping error handling specification (HIGH confidence)
- Tree-sitter error recovery documentation and test fixtures (HIGH confidence)
- Qdrant embedding model migration tutorial (MEDIUM confidence — referenced but not fully fetched)

---
*Pitfalls research for: AI-assisted development framework with local RAG for code*
*Researched: 2026-03-31*
