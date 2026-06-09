import type { ModuleInfo, MavenCoordinates } from '@ia-framework/core';

/**
 * T023: Module resolver
 *
 * Derives module hierarchy info from a relative file path's directory segments,
 * and optionally parses Maven coordinates from a pom.xml string.
 *
 * Path convention: group/module[/submodule]/src/...
 *   - group:     first path segment (e.g., "payments")
 *   - module:    second segment (e.g., "merchant-gateway")
 *   - submodule: third segment if present and different from "src" (e.g., "merchant-gateway-core")
 */

export interface ModuleResolution {
  moduleInfo: ModuleInfo;
  mavenCoordinates?: MavenCoordinates;
}

/**
 * Resolve module info from a relative file path.
 * Optionally parses Maven coordinates from provided pom.xml content.
 *
 * @param relativePath - Path relative to project root (e.g., "payments/merchant-gateway/src/Foo.java")
 * @param pomContent   - Contents of pom.xml as string (optional)
 */
export function resolveModule(relativePath: string, pomContent?: string): ModuleResolution {
  const segments = relativePath.split('/').filter((s) => s.length > 0);

  const moduleInfo: ModuleInfo = deriveModuleInfo(segments);
  const mavenCoords = pomContent ? parseMavenCoordinates(pomContent) : undefined;

  const result: ModuleResolution = { moduleInfo };
  if (mavenCoords) result.mavenCoordinates = mavenCoords;
  return result;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Derive group/module/submodule from path segments.
 *
 * Convention:
 *   [group]/[module]/[submodule?]/src/...
 *
 * 'src' is treated as a boundary — anything at or after 'src' is not a module segment.
 * If fewer than 2 meaningful segments exist, returns empty strings.
 */
function deriveModuleInfo(segments: string[]): ModuleInfo {
  // Filter out known non-module markers at end of path (file name)
  // Find the index of 'src' to stop before it
  const srcIndex = segments.findIndex(
    (s) => s === 'src' || s === 'main' || s === 'java' || s === 'test',
  );
  const pathDepth = srcIndex >= 0 ? srcIndex : segments.length - 1; // exclude filename

  if (pathDepth < 2) {
    // Not enough directory depth to extract group + module
    return { group: '', module: '' };
  }

  const group = segments[0]!;
  const module = segments[1]!;

  const info: ModuleInfo = { group, module };
  // submodule is the third segment, only when there are 4+ segments before 'src'
  if (pathDepth >= 3 && segments[2]) info.submodule = segments[2];
  return info;
}

/**
 * Parse Maven coordinates from pom.xml content using simple regex extraction.
 * Handles groupId, artifactId, version in the project root element.
 */
function parseMavenCoordinates(pomContent: string): MavenCoordinates | undefined {
  const groupId = extractXmlText(pomContent, 'groupId');
  const artifactId = extractXmlText(pomContent, 'artifactId');
  const version = extractXmlText(pomContent, 'version');

  if (!groupId || !artifactId || !version) {
    return undefined;
  }

  return { groupId, artifactId, version };
}

/** Extract text content of the first matching XML element. */
function extractXmlText(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`));
  return match?.[1]?.trim();
}
