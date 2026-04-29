// Types
export type {
  ChunkMetadata,
  CodeAnchor,
  ContextSource,
  ProjectProfile,
  EmbeddingVector,
  SearchResult,
  EmbeddingProviderConfig,
  VectorStoreConfig,
  IndexingConfig,
  RetrievalConfig,
  ProjectConfig,
} from './types/index.js';

// Config
export { loadConfig, validateConfig, ConfigNotFoundError } from './config/loader.js';
export {
  ProjectConfigSchema,
  EmbeddingProviderConfigSchema,
  VectorStoreConfigSchema,
  IndexingConfigSchema,
  RetrievalConfigSchema,
  RetrievalModeSchema,
} from './config/schema.js';

// Logger
export { createLogger } from './logger/index.js';
export type { Logger } from './logger/index.js';

// Retrieval helpers
export {
  analyzeRetrievalQuery,
  buildCodeAnchor,
  inferLayerHints,
  inferModulePath,
  inferPackageName,
} from './retrieval/query-intelligence.js';

// Maven
export { MavenModuleParser } from './maven/index.js';
export type {
  MavenCoordinate,
  MavenModuleInfo,
  ModuleGraph,
  ModuleGraphJSON,
} from './maven/index.js';
