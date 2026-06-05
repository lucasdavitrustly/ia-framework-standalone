import { createHash } from 'node:crypto';
import type { CodeChunk } from '../types.js';

/**
 * T051: XML chunker — regex/line-based.
 *
 * Splits XML files at major structural elements (bean, dependency, plugin, import).
 * Designed for Spring application context XML files and Maven pom.xml files.
 * Returns a single module chunk for files with no recognized structural elements.
 */

function makeChunkId(filePath: string, startLine: number, endLine: number): string {
  return createHash('sha1').update(`${filePath}:${startLine}:${endLine}`).digest('hex');
}

interface XmlElement {
  name: string;
  startLine: number; // 1-indexed
  endLine: number; // 1-indexed
  content: string;
}

/**
 * Elements to extract as top-level chunks.
 * These are the "meaningful" structural units in Spring XML and Maven pom.xml files.
 */
const CHUNK_ELEMENT_TYPES = new Set([
  'bean',
  'import',
  'dependency',
  'plugin',
  'profile',
  'execution',
  'resource',
  'filter',
]);

/**
 * Parse an XML file into CodeChunks, one per major structural element.
 */
export function parseXml(content: string, filePath: string, relativePath: string): CodeChunk[] {
  if (!content || content.trim() === '') {
    return [makeModuleChunk(filePath, relativePath, content, 1, 1)];
  }

  const elements = extractXmlElements(content);

  if (elements.length === 0) {
    const lines = content.split('\n');
    return [makeModuleChunk(filePath, relativePath, content, 1, lines.length)];
  }

  const totalChunks = elements.length;
  return elements.map((el, idx) => ({
    id: makeChunkId(filePath, el.startLine, el.endLine),
    filePath,
    relativePath,
    language: 'xml',
    chunkType: 'config-block' as const,
    name: el.name,
    content: el.content,
    startLine: el.startLine,
    endLine: el.endLine,
    imports: [],
    exports: [],
    chunkIndex: idx,
    totalChunks,
  }));
}

function makeModuleChunk(
  filePath: string,
  relativePath: string,
  content: string,
  startLine: number,
  endLine: number,
): CodeChunk {
  return {
    id: makeChunkId(filePath, startLine, endLine),
    filePath,
    relativePath,
    language: 'xml',
    chunkType: 'module',
    name: undefined,
    content,
    startLine,
    endLine,
    imports: [],
    exports: [],
    chunkIndex: 0,
    totalChunks: 1,
  };
}

/**
 * Extract structural XML elements from content.
 * Uses a line-based scanner to find opening tags for known element types,
 * then matches their closing tags using depth tracking.
 */
function extractXmlElements(content: string): XmlElement[] {
  const lines = content.split('\n');
  const elements: XmlElement[] = [];

  // Pattern to detect opening tags for known element types
  // Matches: <bean ..., <import ..., <dependency ..., etc.
  // Also handles self-closing tags like <import resource="..."/>
  const openTagRe =
    /^\s*<(bean|import|dependency|plugin|profile|execution|resource|filter)(\s|\/?>|>)/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const match = line.match(openTagRe);

    if (match) {
      const elementType = match[1] ?? 'element';

      // Extract the identifying attribute (id, resource, groupId, etc.)
      const name = extractElementName(elementType, line);

      // Check if self-closing on this line
      if (isSelfClosing(line, elementType)) {
        elements.push({
          name: `${elementType}:${name}`,
          startLine: i + 1,
          endLine: i + 1,
          content: line,
        });
        i++;
        continue;
      }

      // Find the matching closing tag
      const closeTagRe = new RegExp(`</${elementType}>`);
      let endLineIdx = i;
      let depth = 0;

      for (let j = i; j < lines.length; j++) {
        const jLine = lines[j] ?? '';
        // Count opening and closing tags of this element type
        const openMatches = jLine.match(new RegExp(`<${elementType}[\\s>]`, 'g'))?.length ?? 0;
        const closeMatches = jLine.match(closeTagRe)?.length ?? 0;
        depth += openMatches - closeMatches;

        if (j === i) {
          // On first line, depth should be 1 after counting the opening tag
          // If depth already dropped to 0 on first line, it's self-closing (already handled)
        }

        if (depth <= 0 && j > i) {
          endLineIdx = j;
          break;
        }
        if (depth <= 0 && j === lines.length - 1) {
          endLineIdx = j;
          break;
        }
        endLineIdx = j;
      }

      const chunkLines = lines.slice(i, endLineIdx + 1);
      elements.push({
        name: `${elementType}:${name}`,
        startLine: i + 1,
        endLine: endLineIdx + 1,
        content: chunkLines.join('\n'),
      });

      i = endLineIdx + 1;
    } else {
      i++;
    }
  }

  return elements;
}

/**
 * Extract a meaningful name for an XML element based on its type and attributes.
 */
function extractElementName(elementType: string, line: string): string {
  switch (elementType) {
    case 'bean': {
      // Try id= first, then class=
      const idMatch = line.match(/\bid\s*=\s*["']([^"']+)["']/);
      if (idMatch) return idMatch[1] ?? elementType;
      const classMatch = line.match(/\bclass\s*=\s*["']([^"'.]+\.)*([^"']+)["']/);
      if (classMatch) return classMatch[2] ?? elementType;
      return elementType;
    }
    case 'import': {
      const resourceMatch = line.match(/\bresource\s*=\s*["']([^"']+)["']/);
      if (resourceMatch) return resourceMatch[1] ?? elementType;
      return elementType;
    }
    case 'dependency': {
      const artifactMatch = line.match(/\bartifactId\s*=\s*["']([^"']+)["']/);
      if (artifactMatch) return artifactMatch[1] ?? elementType;
      return elementType;
    }
    case 'plugin': {
      const artifactMatch = line.match(/\bartifactId\s*=\s*["']([^"']+)["']/);
      if (artifactMatch) return artifactMatch[1] ?? elementType;
      return elementType;
    }
    default:
      return elementType;
  }
}

/**
 * Check if an element tag is self-closing on a single line.
 */
function isSelfClosing(line: string, _elementType: string): boolean {
  // Self-closing: <element ... />
  return /\/>\s*$/.test(line.trimEnd());
}
