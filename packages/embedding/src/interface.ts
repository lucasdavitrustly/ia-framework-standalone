/**
 * Provider-agnostic interface for generating text/code embeddings.
 * Implementations: OpenAIEmbeddingProvider, OllamaEmbeddingProvider
 */
export interface EmbeddingProvider {
  /** Provider name: 'openai' or 'ollama' */
  readonly name: string;
  /** Model identifier used for embeddings */
  readonly model: string;
  /** Vector dimensionality for this model */
  readonly dimensions: number;

  /**
   * Embed a single text string.
   * Returns the embedding vector as an array of floats.
   */
  embed(text: string): Promise<number[]>;

  /**
   * Embed multiple texts in one batch call.
   * More efficient than calling embed() repeatedly.
   * Returns array of vectors in same order as inputs.
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Rough token estimate for budget tracking.
   * Not required to be exact — used for usage monitoring only.
   */
  estimateTokens(text: string): number;
}
