# Quickstart: AST + LLM RAG Optimization

**Feature**: 008-ast-llm-rag-optimization

## Prerequisites

- Node.js >= 22
- pnpm 10+
- Docker (for Qdrant)
- Ollama installed locally with models pulled:
  - Embedding: `nomic-embed-text` (or configured model)
  - Enrichment: `qwen3:8b` (or configured model)

## Setup

```bash
# Start infrastructure
docker compose up -d   # Qdrant on localhost:6333

# Ensure Ollama models are available
ollama pull nomic-embed-text
ollama pull qwen3:8b

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## Configuration

Edit `.ia-framework/project.json`:

```json
{
  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text",
    "baseUrl": "http://localhost:11434",
    "dimensions": 768
  },
  "enrichment": {
    "provider": "ollama",
    "model": "qwen3:8b",
    "baseUrl": "http://localhost:11434",
    "numCtx": 32768,
    "enabled": true,
    "concurrency": 2,
    "retryAttempts": 3,
    "skipOnFailure": true
  },
  "vectorStore": {
    "host": "localhost",
    "port": 6333,
    "collectionName": "codebase"
  }
}
```

## First Index (Migration from Previous Version)

```bash
# If upgrading from previous version (old schema detected):
ia-framework index --force

# Normal incremental index:
ia-framework index

# Index without LLM enrichment (CI, no GPU, quick mode):
ia-framework index --skip-enrichment
```

## Verify

```bash
# Run tests
pnpm test

# Run benchmark to validate retrieval quality
pnpm --filter @ia-framework/benchmark run benchmark
```

## Development Workflow

```bash
# Run specific package tests (TDD)
pnpm --filter @ia-framework/ast-parser test
pnpm --filter @ia-framework/indexer test
pnpm --filter @ia-framework/retrieval test

# Type check all packages
pnpm build

# Start MCP server for testing
pnpm --filter @ia-framework/mcp-server dev
```

## Key Decisions

- **No strategy flag**: `--strategy ast|llm` is removed. The pipeline always uses AST boundaries + optional LLM enrichment.
- **No raw code in Qdrant**: Code is read from filesystem at retrieval time.
- **3 MCP tools**: `search_codebase`, `get_file`, `get_dependencies` (consolidated from 5+).
- **Graceful degradation**: If Ollama unavailable during indexing, continues with AST-only metadata.
