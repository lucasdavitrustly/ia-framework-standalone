interface FormattableRetrievalResult {
  relativePath: string;
  startLine: number;
  endLine: number;
  name?: string | undefined;
  repoId?: string | undefined;
  modulePath?: string | undefined;
  packageName?: string | undefined;
  layerHints?: string[] | undefined;
}

export interface QueryIntent {
  architectureQuery: boolean;
  dataFlowQuery: boolean;
  entryPointQuery: boolean;
}

export function analyzeRetrievalQuery(query: string): QueryIntent {
  const normalized = query.toLowerCase();
  return {
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

export function buildCodeAnchor(result: {
  relativePath: string;
  startLine: number;
  endLine: number;
  name?: string | undefined;
  repoId?: string | undefined;
}): string {
  const lines = `${result.startLine}-${result.endLine}`;
  const repoPrefix = result.repoId ? `[${result.repoId}] ` : '';
  return result.name
    ? `${repoPrefix}${result.relativePath}:${lines} (${result.name})`
    : `${repoPrefix}${result.relativePath}:${lines}`;
}

export function formatRetrievalContext(result: FormattableRetrievalResult): string {
  return [
    `Anchor: ${buildCodeAnchor(result)}`,
    result.modulePath ? `Module: ${result.modulePath}` : '',
    result.packageName ? `Package: ${result.packageName}` : '',
    result.layerHints?.length ? `Layers: ${result.layerHints.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}
