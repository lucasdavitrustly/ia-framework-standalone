/**
 * Synonym map for related-concept expansion.
 *
 * Used by searchWithFallback to find related concepts when a query
 * for a non-existent feature returns zero results.
 */
const SYNONYM_MAP: Record<string, string[]> = {
  websocket: ['message', 'queue', 'event', 'broker', 'listener', 'publish'],
  grpc: ['protobuf', 'stub', 'channel', 'service', 'rpc'],
  rest_api: ['controller', 'endpoint', 'handler', 'mapping', 'RequestMapping'],
  cache: ['redis', 'caffeine', 'evict', 'CacheEvict', 'Cacheable'],
  graphql: ['query', 'resolver', 'schema', 'mutation'],
};

/**
 * Returns synonym terms for a given query string.
 * Lowercases the query and checks if any synonym key is a substring of it.
 * Returns the first match's terms, or [] if no match is found.
 */
export function getRelatedTerms(query: string): string[] {
  const lower = query.toLowerCase();
  for (const [key, terms] of Object.entries(SYNONYM_MAP)) {
    if (lower.includes(key)) {
      return terms;
    }
  }
  return [];
}
