import type { ModuleGraph, MavenCoordinate } from '@ia-framework/core';

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
  return withoutFile ? withoutFile.split('/').join('.') : undefined;
}

export function inferLayerHints(
  relativePath: string,
  chunkType: string,
  content: string,
): string[] {
  const path = relativePath.toLowerCase();
  const lowered = content.toLowerCase();
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
    if (path.includes(needle) || lowered.includes(needle)) {
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

/**
 * Match a file path against the Maven module graph to find its Maven coordinates.
 */
export function inferMavenModule(
  relativePath: string,
  graph: ModuleGraph,
): MavenCoordinate | undefined {
  const normalized = relativePath.replace(/\\/g, '/');
  for (const [, info] of graph.modules) {
    const moduleDir = info.pomPath.replace(/\/pom\.xml$/, '/');
    if (normalized.startsWith(info.sourceRoot) || normalized.startsWith(moduleDir)) {
      return info.coordinate;
    }
  }
  return undefined;
}
