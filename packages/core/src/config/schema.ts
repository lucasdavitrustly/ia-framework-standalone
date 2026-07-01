import { z } from 'zod';

export const EmbeddingProviderConfigSchema = z.object({
  provider: z.enum(['openai', 'ollama']),
  model: z.string().min(1),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  dimensions: z.number().int().positive().optional(),
});

export const VectorStoreConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  collectionName: z.string().min(1),
  apiKey: z.string().optional(),
});

export const LlmConfigSchema = z.object({
  /** Ollama model for LLM chunking (e.g. 'llama3.2:latest') — separate from embedding model */
  model: z.string().min(1),
  /** Ollama base URL (default: http://localhost:11434) */
  ollamaUrl: z.string().url().default('http://localhost:11434'),
});

export const IndexingConfigSchema = z.object({
  includePatterns: z.array(z.string()).default([]),
  excludePatterns: z.array(z.string()).default([]),
  maxChunkLines: z.number().int().positive().optional(),
  respectGitignore: z.boolean().optional(),
  /** Override default embedding concurrency (provider-aware). Ollama default: 3, OpenAI default: 10. */
  embeddingConcurrency: z.number().int().positive().optional(),
  /** Number of chunks per embedding API call (default: 50, range: 1-200). */
  embeddingBatchSize: z.number().int().min(1).max(200).optional(),
  /** LLM chunking configuration (optional — when present, enables LLM-based chunking strategy) */
  llm: LlmConfigSchema.optional(),
  /** LLM enrichment configuration (optional — enables Ollama metadata enrichment) */
  enrichment: z
    .object({
      provider: z.literal('ollama').default('ollama'),
      model: z.string().min(1).default('qwen3:8b'),
      baseUrl: z.string().url().optional(),
      numCtx: z.number().int().positive().optional(),
      concurrency: z.number().int().positive().optional(),
      retryAttempts: z.number().int().min(0).max(10).optional(),
      skipOnFailure: z.boolean().optional(),
      excludeLanguages: z.array(z.string().min(1)).optional(),
      excludeStereotypes: z.array(z.string().min(1)).optional(),
      minEnrichmentLines: z.number().int().min(1).optional(),
      excludeExtensions: z.array(z.string().min(1)).optional(),
      maxBatchChunks: z.number().int().min(1).max(50).optional(),
      charsPerToken: z.number().min(1).max(10).optional(),
      tokenBudgetRatio: z.number().min(0.2).max(0.7).optional(),
      outputTokensPerChunk: z.number().int().min(50).max(1000).optional(),
    })
    .optional(),
});

export const ProjectProfileSchema = z.object({
  languages: z.array(z.string()),
  frameworks: z.array(z.string()),
  packageManager: z.string(),
  testRunner: z.string().optional(),
  buildCommand: z.string().optional(),
  devCommand: z.string().optional(),
});

export const RetrievalModeSchema = z.enum(['mcp-only', 'auto-context', 'combined']);

export const ClassificationRulesSchema = z
  .object({
    /** Regex patterns (as strings) that identify symbol/identifier queries */
    symbolPatterns: z.array(z.string()).optional(),
    /** Verbs that indicate a lookup query when at the start */
    lookupVerbs: z.array(z.string()).optional(),
    /** Max word count for a query to be considered keyword-type */
    maxKeywordWords: z.number().int().min(1).max(20).optional(),
  })
  .optional();

export const RerankingConfigSchema = z
  .object({
    /** Enable BM25 re-ranking after initial retrieval (default: true) */
    enabled: z.boolean().default(true),
    /** Number of results to keep after re-ranking (default: 10) */
    topK: z.number().int().min(1).max(50).default(10),
    /** Prefetch multiplier: retrieve topK * prefetchMultiplier results before re-ranking (default: 3) */
    prefetchMultiplier: z.number().int().min(1).max(10).default(3),
  })
  .optional();

export const MultiHopConfigSchema = z
  .object({
    /** Enable multi-hop retrieval: extract symbols from results and do a second pass (default: true) */
    enabled: z.boolean().default(true),
    /** Max symbols to extract per hop for second-pass retrieval (default: 5) */
    maxSymbols: z.number().int().min(1).max(20).default(5),
    /** Expand on method calls referenced in retrieved chunks (default: true) */
    expandMethodCalls: z.boolean().default(true),
    /** Expand on class hierarchies (extends/implements) (default: true) */
    expandHierarchy: z.boolean().default(true),
  })
  .optional();

export const RetrievalConfigSchema = z.object({
  /** Retrieval mode: mcp-only (default), auto-context (v2), combined (v2) */
  mode: RetrievalModeSchema.default('mcp-only'),
  /** Number of dependency graph hops to expand results: 0 = off, 1 = direct imports, 2 = transitive */
  expansionHops: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(1),
  /** Top-K results for auto-context injection (v2) */
  autoContextTopK: z.number().int().min(1).max(20).default(5),
  /** Soft token budget cap per search tool call. Results trimmed from bottom when exceeded. 0 = unlimited. Default: 40000. */
  maxTokensPerCall: z.number().int().positive().optional(),
  /** Default minimum relevance score threshold. Results below this are filtered out. */
  scoreThreshold: z.number().min(0).max(1).optional(),
  /** Classification rules for query complexity classifier */
  classificationRules: ClassificationRulesSchema,
  /** Confidence threshold for keyword early exit (0-1). Queries at or above skip vector search. */
  earlyExitConfidence: z.number().min(0).max(1).default(0.8),
  /** RRF constant (default: 60). Lower values amplify top-ranked differences. */
  rrfK: z.number().int().min(1).max(200).optional(),
  /** RRF score threshold for hybrid search (default: 0.015). Results below this are filtered. */
  rrfScoreThreshold: z.number().min(0).max(1).optional(),
  /** Prefetch multiplier for keyword (sparse/BM25) branch (default: 3). Higher = more keyword influence. */
  keywordPrefetchMultiplier: z.number().min(1).max(10).optional(),
  /** Prefetch multiplier for semantic (dense) branches (default: 3). Higher = more semantic influence. */
  semanticPrefetchMultiplier: z.number().min(1).max(10).optional(),
  /** BM25 re-ranking configuration */
  reranking: RerankingConfigSchema,
  /** Multi-hop retrieval configuration */
  multiHop: MultiHopConfigSchema,
});

export const RepoEntrySchema = z.object({
  path: z.string().min(1),
  name: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .optional(),
  provides: z.array(z.string()).optional(),
  profile: ProjectProfileSchema.optional(),
  /** When true, this repo is an agent-docs injection target (opt-in; default false). */
  injectAgents: z.boolean().optional(),
});

export const ProjectConfigSchema = z
  .object({
    targetProjectPath: z.string().min(1).optional(),
    repos: z.array(RepoEntrySchema).min(1).optional(),
    /** Extra injection-only targets (paths) that are NOT indexed (resolved relative to config dir). */
    agentInjectionTargets: z.array(z.string().min(1)).optional(),
    embedding: EmbeddingProviderConfigSchema,
    vectorStore: VectorStoreConfigSchema,
    indexing: IndexingConfigSchema.optional(),
    profile: ProjectProfileSchema.optional(),
    retrieval: RetrievalConfigSchema.optional(),
  })
  .refine(
    (d) => Boolean(d.targetProjectPath) !== Boolean(d.repos),
    'Config must have exactly one of targetProjectPath or repos (not both, not neither)',
  );
