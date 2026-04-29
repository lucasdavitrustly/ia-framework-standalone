export interface QueryIntent {
  symbolTerms: string[];
  packageTerms: string[];
  architectureQuery: boolean;
  dataFlowQuery: boolean;
  entryPointQuery: boolean;
}

const SYMBOL_PATTERN = /\b[A-Z][A-Za-z0-9_]*\b/g;
const PACKAGE_PATTERN = /\b[a-z]+(?:\.[a-z][a-z0-9_]*){1,}\b/g;

export function analyzeRetrievalQuery(query: string): QueryIntent {
  const normalized = query.toLowerCase();

  return {
    symbolTerms: Array.from(new Set(query.match(SYMBOL_PATTERN) ?? [])),
    packageTerms: Array.from(new Set(query.match(PACKAGE_PATTERN) ?? [])),
    architectureQuery:
      normalized.includes('architecture') ||
      normalized.includes('main modules') ||
      normalized.includes('how they interact'),
    dataFlowQuery:
      normalized.includes('data flow') ||
      normalized.includes('request to database') ||
      normalized.includes('route to model') ||
      normalized.includes('controller') ||
      normalized.includes('repository'),
    entryPointQuery:
      normalized.includes('entry point') ||
      normalized.includes('main entry') ||
      normalized.includes('where is the main'),
  };
}
