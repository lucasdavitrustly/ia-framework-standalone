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

export const IndexingConfigSchema = z.object({
  includePatterns: z.array(z.string()),
  excludePatterns: z.array(z.string()),
  maxChunkLines: z.number().int().positive().optional(),
  respectGitignore: z.boolean().optional(),
});

export const ProjectProfileSchema = z.object({
  languages: z.array(z.string()),
  frameworks: z.array(z.string()),
  packageManager: z.string(),
  testRunner: z.string().optional(),
  buildCommand: z.string().optional(),
  devCommand: z.string().optional(),
});

export const ProjectConfigSchema = z.object({
  targetProjectPath: z.string().min(1),
  embedding: EmbeddingProviderConfigSchema,
  vectorStore: VectorStoreConfigSchema,
  indexing: IndexingConfigSchema.optional(),
  profile: ProjectProfileSchema.optional(),
});
