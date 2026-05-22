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
  RepoEntry,
  ProjectConfig,
} from './types/index.js';

// Config
export { loadConfig, validateConfig, ConfigNotFoundError } from './config/loader.js';
export { RepoRegistry } from './config/registry.js';
export { detectRepoProfile, detectRepoProvides } from './config/detector.js';
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

// Graph
export { CrossRepoEdgeStore, type CrossRepoEdge } from './graph/cross-repo-edges.js';
export { resolveImportToRepo, type ImportResolution } from './graph/import-resolver.js';

// Maven
export { MavenModuleParser } from './maven/index.js';
export type {
  MavenCoordinate,
  MavenModuleInfo,
  ModuleGraph,
  ModuleGraphJSON,
} from './maven/index.js';
