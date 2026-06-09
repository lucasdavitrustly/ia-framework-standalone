import { createHash } from 'node:crypto';
import type { CodeChunk } from '../types.js';

/**
 * T050: YAML chunker.
 *
 * Splits a YAML file at top-level mapping keys.
 * Each top-level key (indented at column 0) becomes a config-block chunk.
 * Detects Java class references in values and produces dependencyEdges
 * with relation 'configures' (T036/US2).
 *
 * Uses indentation-based parsing — no native dependencies required.
 */

function makeChunkId(filePath: string, startLine: number, endLine: number): string {
  return createHash('sha1').update(`${filePath}:${startLine}:${endLine}`).digest('hex');
}

interface TopLevelSection {
  name: string;
  startLine: number; // 1-indexed
  endLine: number; // 1-indexed
  lines: string[];
}

/**
 * Parse a YAML file into CodeChunks, one per top-level mapping key.
 */
export function parseYaml(content: string, filePath: string, relativePath: string): CodeChunk[] {
  if (!content || content.trim() === '') {
    return [
      {
        id: makeChunkId(filePath, 1, 1),
        filePath,
        relativePath,
        language: 'yaml',
        chunkType: 'module',
        name: undefined,
        content,
        startLine: 1,
        endLine: 1,
        imports: [],
        exports: [],
        chunkIndex: 0,
        totalChunks: 1,
      },
    ];
  }

  const rawLines = content.split('\n');
  const sections = extractTopLevelSections(rawLines);

  if (sections.length === 0) {
    // File has only scalar values or a single top-level key
    return [
      {
        id: makeChunkId(filePath, 1, rawLines.length),
        filePath,
        relativePath,
        language: 'yaml',
        chunkType: 'module',
        name: undefined,
        content,
        startLine: 1,
        endLine: rawLines.length,
        imports: [],
        exports: [],
        chunkIndex: 0,
        totalChunks: 1,
      },
    ];
  }

  const totalChunks = sections.length;
  return sections.map((section, idx) => {
    const sectionContent = section.lines.join('\n');
    const dependencyEdges = extractClassReferences(section.lines);

    const chunk: CodeChunk = {
      id: makeChunkId(filePath, section.startLine, section.endLine),
      filePath,
      relativePath,
      language: 'yaml',
      chunkType: 'config-block',
      name: section.name,
      content: sectionContent,
      startLine: section.startLine,
      endLine: section.endLine,
      imports: [],
      exports: [],
      chunkIndex: idx,
      totalChunks,
    };

    if (dependencyEdges.length > 0) {
      chunk.dependencyEdges = dependencyEdges;
    }

    return chunk;
  });
}

/**
 * Extract top-level sections from YAML lines.
 * A top-level section starts when we find a line at column 0 that matches
 * a mapping key pattern: `key:` (not a comment, document marker, or blank line).
 */
function extractTopLevelSections(lines: string[]): TopLevelSection[] {
  const sections: TopLevelSection[] = [];
  const topLevelKeyRe = /^([a-zA-Z_][a-zA-Z0-9_\-.]*):\s*(.*)?$/;

  let currentSection: TopLevelSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Skip document separators, comments, and blank lines at the start
    if (line.trimStart().startsWith('#') || line.trim() === '---' || line.trim() === '...') {
      if (currentSection) {
        currentSection.lines.push(line);
      }
      continue;
    }

    // Check if this is a top-level mapping key (no leading whitespace, matches key: pattern)
    const isTopLevel = line.length > 0 && line[0] !== ' ' && line[0] !== '\t';
    const match = isTopLevel ? line.match(topLevelKeyRe) : null;

    if (match) {
      // Save previous section
      if (currentSection) {
        // Trim trailing blank lines from previous section
        while (
          currentSection.lines.length > 0 &&
          (currentSection.lines[currentSection.lines.length - 1] ?? '').trim() === ''
        ) {
          currentSection.lines.pop();
        }
        currentSection.endLine = currentSection.startLine + currentSection.lines.length - 1;
        sections.push(currentSection);
      }

      // Start new section
      const keyName = match[1] ?? line.split(':')[0] ?? 'unknown';
      currentSection = {
        name: keyName,
        startLine: i + 1, // 1-indexed
        endLine: i + 1,
        lines: [line],
      };
    } else if (currentSection) {
      // Continue current section
      currentSection.lines.push(line);
    }
    // Lines before any top-level key are ignored (syntax comments, etc.)
  }

  // Save last section
  if (currentSection) {
    while (
      currentSection.lines.length > 0 &&
      (currentSection.lines[currentSection.lines.length - 1] ?? '').trim() === ''
    ) {
      currentSection.lines.pop();
    }
    currentSection.endLine = currentSection.startLine + currentSection.lines.length - 1;
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Detect Java class references in YAML values (e.g. driver-class-name: com.example.Foo).
 * Returns dependencyEdges with relation 'configures' for each detected class reference.
 */
function extractClassReferences(
  lines: string[],
): Array<{ targetPath: string; relation: string; symbols?: string[] }> {
  // Match values that look like Java fully-qualified class names
  // Pattern: com.example.SomethingClass or org.something.ClassName
  const classRefRe = /:\s+([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+\.[A-Z][a-zA-Z0-9]+)/g;
  const edges: Array<{ targetPath: string; relation: string; symbols?: string[] }> = [];
  const seen = new Set<string>();

  for (const line of lines) {
    let match: RegExpExecArray | null;
    classRefRe.lastIndex = 0;
    while ((match = classRefRe.exec(line)) !== null) {
      const fqcn = match[1];
      if (fqcn && !seen.has(fqcn)) {
        seen.add(fqcn);
        // Convert FQCN to a relative path (e.g. com.example.Foo → com/example/Foo.java)
        const targetPath = fqcn.replace(/\./g, '/') + '.java';
        edges.push({
          targetPath,
          relation: 'configures',
          symbols: [fqcn.split('.').pop() ?? fqcn],
        });
      }
    }
  }

  return edges;
}
