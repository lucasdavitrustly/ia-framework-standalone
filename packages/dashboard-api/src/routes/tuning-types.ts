/**
 * Response DTOs for the /api/tuning endpoints.
 * These are plain data shapes — no business logic.
 */

/** A single chunk entry returned by the chunk inspector API */
export interface ChunkBrowseEntry {
  chunkId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  chunkType: string;
  source: 'ast' | 'llm';
  /** Heuristic quality score 0-100. Only present for LLM-chunked points (Pitfall 4). */
  qualityScore?: number;
  /** Prose summary / name from LLM chunking */
  name?: string;
  /** Raw source code content */
  content: string;
}

/** Paginated chunk browse response */
export interface ChunkBrowseResponse {
  chunks: ChunkBrowseEntry[];
  total: number;
}

/** A single search candidate in the unfiltered score analysis */
export interface ScoreCandidate {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  score: number;
  source: 'ast' | 'llm';
  chunkType: string;
  content: string;
  /** true when score >= original query's scoreThreshold */
  aboveThreshold: boolean;
  /** true when result is within 10% below threshold (near-miss per D-10) */
  isNearMiss: boolean;
}

/** Full score analysis response for a search history entry */
export interface ScoreAnalysisResponse {
  /** Original query text */
  query: string;
  /** The scoreThreshold used in the original search */
  threshold: number;
  /** Top-50 candidates (unfiltered, sorted by score desc) */
  candidates: ScoreCandidate[];
  /** Count of candidates with aboveThreshold=true */
  returnedCount: number;
  /** Count of candidates with aboveThreshold=false */
  filteredCount: number;
  /** Count of near-miss candidates (within 10% below threshold) */
  nearMissCount: number;
}
