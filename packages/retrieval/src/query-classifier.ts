/**
 * T060: Query classifier for the unified search pipeline.
 *
 * Classifies a search query into one of four types based on heuristic patterns:
 * - 'semantic': natural language description → use semantic vector
 * - 'symbol': CamelCase.method, dotted path, or :: notation → signature + sparse
 * - 'keyword': single uppercase/CamelCase token → sparse + semantic
 * - 'mixed': combination of natural language and identifiers → all 3 vectors
 *
 * This is a fast, deterministic heuristic — no LLM call required.
 * Classification happens in <1ms, preserving the <500ms retrieval budget.
 */

export type QueryType = 'semantic' | 'symbol' | 'keyword' | 'mixed';

/**
 * Classify a search query string into a QueryType.
 *
 * @param query - The raw search query string
 * @returns QueryType — determines which vector(s) to search
 */
export function classifyQuery(query: string): QueryType {
  const trimmed = query.trim();

  if (!trimmed) return 'semantic';

  const hasDotOrDoubleColon = /[.:]{1,2}[A-Za-z]/.test(trimmed);
  const hasCamelCase = /[A-Z][a-z]+[A-Za-z0-9]*/.test(trimmed);
  const hasNaturalLanguage = /\s/.test(trimmed) && /\b[a-z]{3,}\b/.test(trimmed);
  const isAllUpperWithUnderscores = /^[A-Z][A-Z0-9_]+$/.test(trimmed);
  const isSingleToken = !/\s/.test(trimmed);

  // Symbol: CamelCase.method, fully.qualified.class, Class::method
  if (hasDotOrDoubleColon && hasCamelCase) {
    return 'symbol';
  }

  // Mixed: natural language text + CamelCase identifiers (both present)
  if (hasNaturalLanguage && hasCamelCase) {
    return 'mixed';
  }

  // Keyword: single uppercase token (CamelCase or SNAKE_CASE), no spaces, no dots
  if (isSingleToken && (hasCamelCase || isAllUpperWithUnderscores)) {
    return 'keyword';
  }

  // Semantic: natural language (multiple lowercase words), or single lowercase word
  return 'semantic';
}

/**
 * Determine which vector names to use for a given QueryType.
 *
 * @returns Array of vector names to search in Qdrant
 */
export function getVectorsForQueryType(
  queryType: QueryType,
): Array<'semantic' | 'signature' | 'sparse'> {
  switch (queryType) {
    case 'semantic':
      return ['semantic'];
    case 'symbol':
      return ['signature', 'sparse'];
    case 'keyword':
      return ['sparse', 'semantic'];
    case 'mixed':
      return ['semantic', 'signature', 'sparse'];
  }
}
