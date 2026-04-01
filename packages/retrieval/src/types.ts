/**
 * A natural language query to the retrieval engine.
 */
export interface RetrievalQuery {
  /** Natural language search text */
  text: string;
  /** Maximum number of results (default: 10) */
  limit?: number | undefined;
  /** Minimum similarity score 0-1 (default: 0.5) */
  scoreThreshold?: number | undefined;
  /** Optional Qdrant payload filter */
  filter?: Record<string, unknown> | undefined;
}

/**
 * A single ranked retrieval result.
 * Maps from Qdrant ChunkPayload + search score.
 */
export interface RetrievalResult {
  /** Original string chunk ID (sha1) */
  chunkId: string;
  /** Absolute path to source file */
  filePath: string;
  /** Path relative to project root */
  relativePath: string;
  /** Programming language */
  language: string;
  /** Type of code construct */
  chunkType: string;
  /** Name of the construct (function/class name), if applicable */
  name?: string | undefined;
  /** Raw source code text */
  content: string;
  /** 1-indexed start line */
  startLine: number;
  /** 1-indexed end line */
  endLine: number;
  /** Module specifiers this chunk imports */
  imports: string[];
  /** Names this chunk exports */
  exports: string[];
  /** Best similarity score across text + code vectors (0-1) */
  score: number;
  /** Which vector(s) contributed to this result */
  matchedVector: 'text' | 'code' | 'both';
}

/**
 * Configuration for the SearchEngine.
 */
export interface SearchEngineConfig {
  /** Embedding provider to embed queries */
  embeddingProvider: {
    embed(text: string): Promise<number[]>;
    dimensions: number;
  };
  /** Vector store to search against */
  vectorStore: {
    search(
      queryVector: number[],
      options: {
        vectorName: 'text' | 'code';
        limit: number;
        scoreThreshold?: number | undefined;
        filter?: Record<string, unknown> | undefined;
      },
    ): Promise<
      Array<{
        id: string;
        score: number;
        payload: {
          chunkId: string;
          filePath: string;
          relativePath: string;
          language: string;
          chunkType: string;
          name?: string | undefined;
          content: string;
          startLine: number;
          endLine: number;
          imports: string[];
          exports: string[];
          indexedAt: string;
        };
        vectorName: 'text' | 'code';
      }>
    >;
  };
  /** Default number of results (default: 10) */
  defaultLimit?: number | undefined;
  /** Default score threshold (default: 0.5) */
  defaultScoreThreshold?: number | undefined;
}
