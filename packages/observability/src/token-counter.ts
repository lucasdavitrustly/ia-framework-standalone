/**
 * Estimates token counts using a characters-per-token heuristic.
 * ~4 characters per token is a reasonable approximation for mixed English + code content.
 */
export class TokenCounter {
  private readonly charsPerToken: number;

  constructor(charsPerToken = 4) {
    this.charsPerToken = charsPerToken;
  }

  /** Estimate token count for a single text string */
  count(text: string): number {
    if (text.length === 0) return 0;
    return Math.ceil(text.length / this.charsPerToken);
  }

  /** Estimate total tokens for a query + array of chunk content strings */
  countRagEvent(query: string, chunkContents: string[]): number {
    const total = query + chunkContents.join('');
    return this.count(total);
  }
}
