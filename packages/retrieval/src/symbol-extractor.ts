/**
 * Symbol extractor for multi-hop retrieval.
 *
 * Extracts class references and method call symbols from code chunk content
 * that can be used as seeds for a second retrieval pass.
 */

import type { RetrievalResult } from './types.js';

export interface ExtractedSymbols {
  /** Class/interface names referenced in the code (PascalCase identifiers) */
  classReferences: string[];
  /** Method/function names called (camelCase identifiers after `.` or standalone calls) */
  methodCalls: string[];
}

// Common noise words to filter out (language keywords, common types)
const NOISE_CLASSES = new Set([
  'String',
  'Integer',
  'Long',
  'Double',
  'Float',
  'Boolean',
  'Byte',
  'Short',
  'Character',
  'Object',
  'Class',
  'Void',
  'Number',
  'Math',
  'System',
  'Arrays',
  'Collections',
  'List',
  'Map',
  'Set',
  'Optional',
  'Stream',
  'Collection',
  'Iterator',
  'Exception',
  'Error',
  'Throwable',
  'RuntimeException',
  'Override',
  'Deprecated',
  'SuppressWarnings',
  'FunctionalInterface',
  'Test',
  'Before',
  'After',
  'BeforeEach',
  'AfterEach',
  'Promise',
  'Array',
  'Record',
  'Partial',
  'Required',
  'Readonly',
  'Date',
  'RegExp',
  'JSON',
  'Console',
  'Buffer',
]);

const NOISE_METHODS = new Set([
  'get',
  'set',
  'put',
  'add',
  'remove',
  'contains',
  'size',
  'isEmpty',
  'toString',
  'equals',
  'hashCode',
  'clone',
  'compareTo',
  'valueOf',
  'of',
  'from',
  'parse',
  'format',
  'println',
  'printf',
  'log',
  'info',
  'debug',
  'warn',
  'error',
  'trace',
  'then',
  'catch',
  'finally',
  'map',
  'filter',
  'reduce',
  'forEach',
  'push',
  'pop',
  'shift',
  'length',
  'trim',
  'split',
  'join',
]);

/**
 * Extract class references from code content.
 * Looks for PascalCase identifiers that likely represent type references.
 */
function extractClassReferences(content: string): string[] {
  // Match PascalCase identifiers (new X, extends X, implements X, : X, <X>, X.method)
  const patterns = [
    /\bnew\s+([A-Z][a-zA-Z0-9]+)/g,
    /\bextends\s+([A-Z][a-zA-Z0-9]+)/g,
    /\bimplements\s+([\w,\s]+)/g,
    /:\s*([A-Z][a-zA-Z0-9]+)/g,
    /\b([A-Z][a-zA-Z0-9]+)\s*\./g,
    /<([A-Z][a-zA-Z0-9]+)[>,\s]/g,
    /\binstanceof\s+([A-Z][a-zA-Z0-9]+)/g,
    /@([A-Z][a-zA-Z0-9]+)/g,
    // Java-style type declarations: "TypeName varName" or "final TypeName varName"
    /\b([A-Z][a-zA-Z0-9]+)\s+[a-z][a-zA-Z0-9]*\s*[;=,(]/g,
  ];

  const classes = new Set<string>();
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const captured = match[1]!;
      // Handle "implements X, Y, Z"
      if (captured.includes(',')) {
        for (const part of captured.split(',')) {
          const trimmed = part.trim();
          if (/^[A-Z][a-zA-Z0-9]+$/.test(trimmed) && !NOISE_CLASSES.has(trimmed)) {
            classes.add(trimmed);
          }
        }
      } else if (!NOISE_CLASSES.has(captured)) {
        classes.add(captured);
      }
    }
  }

  return [...classes];
}

/**
 * Extract method call symbols from code content.
 */
function extractMethodCalls(content: string): string[] {
  // Match method calls: .methodName( or standalone function calls
  const pattern = /\.([a-z][a-zA-Z0-9]+)\s*\(/g;
  const methods = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const name = match[1]!;
    if (!NOISE_METHODS.has(name) && name.length > 2) {
      methods.add(name);
    }
  }

  return [...methods];
}

/**
 * Extract symbols from a set of retrieval results for multi-hop expansion.
 *
 * @param results - Initial retrieval results to extract symbols from
 * @param maxSymbols - Maximum total symbols to return (default: 15)
 * @returns Extracted class references and method calls, deduplicated against existing results
 */
export function extractSymbols(
  results: RetrievalResult[],
  maxSymbols: number = 15,
): ExtractedSymbols {
  // Collect names already in the result set to avoid re-fetching
  const existingNames = new Set<string>();
  for (const r of results) {
    if (r.name) existingNames.add(r.name);
  }

  const allClasses = new Set<string>();
  const allMethods = new Set<string>();

  for (const r of results) {
    for (const cls of extractClassReferences(r.content)) {
      if (!existingNames.has(cls)) allClasses.add(cls);
    }
    for (const method of extractMethodCalls(r.content)) {
      allMethods.add(method);
    }
  }

  // Prioritize class references (more valuable for domain understanding)
  const classLimit = Math.min(allClasses.size, Math.ceil(maxSymbols * 0.6));
  const methodLimit = Math.min(allMethods.size, maxSymbols - classLimit);

  return {
    classReferences: [...allClasses].slice(0, classLimit),
    methodCalls: [...allMethods].slice(0, methodLimit),
  };
}
