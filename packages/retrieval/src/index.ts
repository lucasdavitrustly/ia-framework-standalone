export { SearchEngine, computeTermFrequencySparseVector } from './search-engine.js';
export { getRelatedTerms } from './search-synonyms.js';
export { DependencyGraph } from './dependency-graph.js';
export type { DependencyGraphConfig } from './dependency-graph.js';
export type {
  RetrievalQuery,
  RetrievalResult,
  SearchEngineConfig,
  FallbackSearchResult,
  FallbackSuggestion,
} from './types.js';
export { rrfMerge } from './rrf.js';
export type { RankedList } from './rrf.js';
export { MultiCollectionSearchEngine } from './multi-collection-search-engine.js';
export type {
  CollectionEngine,
  MultiCollectionSearchEngineConfig,
} from './multi-collection-search-engine.js';
export { mmrRerank, classifyQueryLambda, jaccardSimilarity, cosineSimilarity } from './mmr.js';
export type { MmrOptions } from './mmr.js';
export { applyElbowTruncation } from './elbow-detection.js';
export type { ElbowOptions } from './elbow-detection.js';
export { bm25Rerank } from './bm25-reranker.js';
export type { Bm25RerankOptions } from './bm25-reranker.js';
export { extractSymbols } from './symbol-extractor.js';
export type { ExtractedSymbols } from './symbol-extractor.js';
export { multiHopExpand } from './multi-hop.js';
export type { MultiHopConfig, MultiHopEngine } from './multi-hop.js';
