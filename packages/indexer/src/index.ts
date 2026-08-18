export { IndexingPipeline } from './pipeline.js';
export type {
  FailedFile,
  IndexRunMetrics,
  IndexRunSummary,
  IndexingConfig,
  IndexingProgress,
  ProgressCallback,
} from './pipeline.js';
export { walkFiles } from './file-walker.js';
export type { WalkOptions } from './file-walker.js';
export {
  getChangedFiles,
  getCurrentCommit,
  getFullReindexRequired,
  getLastIndexedCommit,
  getLastEmbeddingModel,
  getLastPromptContentHash,
  saveLastIndexedCommit,
  setFullReindexRequired,
} from './incremental.js';
export type { ChangeFailure, ChangedFiles } from './incremental.js';
export { AstChunkingStrategy, LlmChunkCache, isOllamaReachable } from './strategies/index.js';
export type { ChunkingStrategy, ChunkingConfig, CachedChunkEntry } from './strategies/index.js';
export { scanMavenModuleGraph } from './maven-graph-scanner.js';
export type { MavenGraphScannerOptions } from './maven-graph-scanner.js';
