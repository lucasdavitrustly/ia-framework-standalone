// Types
export type {
  ChunkMetadata,
  ContextSource,
  ProjectProfile,
  EmbeddingVector,
  SearchResult,
  EmbeddingProviderConfig,
  VectorStoreConfig,
  IndexingConfig,
  ProjectConfig,
} from './types/index.js';

// Config
export { loadConfig, validateConfig, ConfigNotFoundError } from './config/loader.js';
export {
  ProjectConfigSchema,
  EmbeddingProviderConfigSchema,
  VectorStoreConfigSchema,
  IndexingConfigSchema,
} from './config/schema.js';

// Logger
export { createLogger } from './logger/index.js';
export type { Logger } from './logger/index.js';
