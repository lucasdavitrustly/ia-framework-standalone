import type { CodeAnchor } from '../types/index.js';

export interface QueryIntent {
  raw: string;
  normalized: string;
  symbolTerms: string[];
  packageTerms: string[];
  architectureQuery: boolean;
  dataFlowQuery: boolean;
  entryPointQuery: boolean;
  javaQuery: boolean;
}

const SYMBOL_PATTERN = /\b[A-Z][A-Za-z0-9_]*\b/g;
const PACKAGE_PATTERN = /\b[a-z]+(?:\.[a-z][a-z0-9_]*){1,}\b/g;

export function analyzeRetrievalQuery(query: string): QueryIntent {
  const normalized = query.toLowerCase();
  const symbolTerms = Array.from(new Set(query.match(SYMBOL_PATTERN) ?? []));
  const packageTerms = Array.from(new Set(query.match(PACKAGE_PATTERN) ?? []));

  return {
    raw: query,
    normalized,
    symbolTerms,
    packageTerms,
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
    javaQuery:
      normalized.includes('java') || normalized.includes('spring') || packageTerms.length > 0,
  };
}

export function inferModulePath(relativePath: string): string | undefined {
  const normalized = relativePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);

  const sourceRootIndex = segments.findIndex((segment) =>
    ['src', 'main', 'test', 'java', 'kotlin'].includes(segment),
  );

  if (sourceRootIndex > 0) {
    return segments.slice(0, sourceRootIndex).join('/');
  }

  if (segments.length >= 2) {
    return segments.slice(0, 2).join('/');
  }

  return segments[0];
}

export function inferPackageName(relativePath: string, content: string): string | undefined {
  const packageMatch = content.match(/^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m);
  if (packageMatch?.[1]) {
    return packageMatch[1];
  }

  const normalized = relativePath.replace(/\\/g, '/');
  const javaRoot = normalized.match(/(?:^|\/)(?:src\/)?(?:main|test)?\/?java\/(.+)$/);
  if (!javaRoot?.[1]) {
    return undefined;
  }

  const withoutFile = javaRoot[1].replace(/\/[^/]+$/, '');
  if (!withoutFile) {
    return undefined;
  }

  return withoutFile.split('/').join('.');
}

export function inferLayerHints(
  relativePath: string,
  chunkType: string,
  content: string,
): string[] {
  const path = relativePath.toLowerCase();
  const hints = new Set<string>();

  const patterns: Array<[string, string[]]> = [
    ['controller', ['controller']],
    ['route', ['route']],
    ['handler', ['handler']],
    ['service', ['service']],
    ['repository', ['repository', 'data']],
    ['dao', ['repository', 'data']],
    ['model', ['model']],
    ['entity', ['model', 'data']],
    ['config', ['config']],
    ['exception', ['exception-handler']],
    ['error', ['exception-handler']],
  ];

  for (const [needle, values] of patterns) {
    if (path.includes(needle) || content.toLowerCase().includes(needle)) {
      for (const value of values) {
        hints.add(value);
      }
    }
  }

  if (chunkType === 'class' && /\b@Controller\b|\b@RestController\b/.test(content)) {
    hints.add('controller');
  }
  if (/\b@Service\b/.test(content)) {
    hints.add('service');
  }
  if (/\b@Repository\b/.test(content)) {
    hints.add('repository');
  }
  if (/\b@ControllerAdvice\b|\bExceptionHandler\b/.test(content)) {
    hints.add('exception-handler');
  }

  return Array.from(hints);
}

export function buildCodeAnchor(args: {
  relativePath: string;
  startLine: number;
  endLine: number;
  name?: string | undefined;
}): CodeAnchor {
  const lines = `${args.startLine}-${args.endLine}`;
  const symbol = args.name;
  const anchor = symbol
    ? `${args.relativePath}:${lines} (${symbol})`
    : `${args.relativePath}:${lines}`;

  return {
    file: args.relativePath,
    symbol,
    lines,
    anchor,
  };
}
