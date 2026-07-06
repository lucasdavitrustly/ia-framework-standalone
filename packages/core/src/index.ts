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
  // Feature 008: AST + LLM RAG Optimization
  EnrichmentConfig,
  Stereotype,
  ArchLayer,
  ModuleInfo,
  MavenCoordinates,
  RelationshipTag,
  DependencyEdge,
  ChunkType,
} from './types/index.js';

// Config
export { loadConfig, validateConfig, ConfigNotFoundError } from './config/loader.js';
export { RepoRegistry } from './config/registry.js';
export type { InjectionTarget } from './config/registry.js';
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
export {
  buildCrossRepoEdges,
  type EdgeBuilderEngine,
  type EdgeBuilderConfig,
  type ChunkForEdgeBuilding,
} from './graph/cross-repo-edge-builder.js';

// Maven
export { MavenModuleParser } from './maven/index.js';
export type {
  MavenCoordinate,
  MavenModuleInfo,
  ModuleGraph,
  ModuleGraphJSON,
} from './maven/index.js';

// SQLite adapter (backend-agnostic: node:sqlite primary, better-sqlite3 fallback)
export { createDatabase, detectSqliteBackend } from './sqlite/index.js';
export type {
  SqliteDatabase,
  SqliteStatement,
  SqliteBackend,
  SqliteDatabaseHandle,
} from './sqlite/index.js';
