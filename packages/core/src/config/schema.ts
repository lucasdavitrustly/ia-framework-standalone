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
  includePatterns: z.array(z.string()),
  excludePatterns: z.array(z.string()),
  maxChunkLines: z.number().int().positive().optional(),
  respectGitignore: z.boolean().optional(),
  /** Override default embedding concurrency (provider-aware). Ollama default: 3, OpenAI default: 10. */
  embeddingConcurrency: z.number().int().positive().optional(),
  /** LLM chunking configuration (optional — when present, enables LLM-based chunking strategy) */
  llm: LlmConfigSchema.optional(),
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

export const RetrievalConfigSchema = z.object({
  /** Retrieval mode: mcp-only (default), auto-context (v2), combined (v2) */
  mode: RetrievalModeSchema.default('mcp-only'),
  /** Number of dependency graph hops to expand results: 0 = off, 1 = direct imports, 2 = transitive */
  expansionHops: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(1),
  /** Top-K results for auto-context injection (v2) */
  autoContextTopK: z.number().int().min(1).max(20).default(5),
});

export const ProjectConfigSchema = z.object({
  targetProjectPath: z.string().min(1),
  embedding: EmbeddingProviderConfigSchema,
  vectorStore: VectorStoreConfigSchema,
  indexing: IndexingConfigSchema.optional(),
  profile: ProjectProfileSchema.optional(),
  retrieval: RetrievalConfigSchema.optional(),
});
