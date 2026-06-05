import Parser from 'tree-sitter';
// tree-sitter-typescript exports { typescript, tsx }
import TSLang from 'tree-sitter-typescript';
import { createHash } from 'node:crypto';
import type { CodeChunk } from '../types.js';

const { typescript: tsLanguage, tsx: tsxLanguage } = TSLang;

// Create parsers per language to avoid shared state issues in tests
let tsParser: Parser | null = null;
let tsxParser: Parser | null = null;

function getParser(useTsx: boolean): Parser {
  if (useTsx) {
    if (!tsxParser) {
      tsxParser = new Parser();
      tsxParser.setLanguage(tsxLanguage as Parameters<Parser['setLanguage']>[0]);
    }
    return tsxParser;
  }
  if (!tsParser) {
    tsParser = new Parser();
    tsParser.setLanguage(tsLanguage as Parameters<Parser['setLanguage']>[0]);
  }
  return tsParser;
}

function makeChunkId(filePath: string, startLine: number, endLine: number): string {
  return createHash('sha1').update(`${filePath}:${startLine}:${endLine}`).digest('hex');
}

// Node types that represent top-level declarations we want to chunk
const DECLARATION_TYPES = new Set([
  'function_declaration',
  'class_declaration',
  'abstract_class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'lexical_declaration', // const/let at module level
  'variable_statement', // var at module level
]);

// Node types inside a class body that become their own chunks
const CLASS_MEMBER_TYPES = new Set(['method_definition', 'public_field_definition']);

// ── T118: TypeScript decorator value extraction for annotationMeta ───────────

/** HTTP method decorator mapping: decorator name → HTTP method */
const TS_HTTP_DECORATORS: Record<string, string> = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Delete: 'DELETE',
  Patch: 'PATCH',
};

/**
 * Extract the first string literal argument from a decorator's arguments node.
 * Handles: @Foo('value'), @Foo("value")
 * Navigates: decorator → call_expression → arguments → string
 */
function extractDecoratorStringArg(decoratorNode: Parser.SyntaxNode): string | undefined {
  // Navigate decorator → call_expression → arguments
  const callExpr = decoratorNode.children.find((c) => c.type === 'call_expression');
  const args =
    callExpr?.children.find((c) => c.type === 'arguments') ??
    decoratorNode.children.find((c) => c.type === 'arguments');
  if (!args) return undefined;

  for (const child of args.children) {
    if (child.type === 'string' || child.type === 'template_string') {
      // Strip surrounding quotes (' or " or `)
      const raw = child.text;
      if (
        (raw.startsWith("'") && raw.endsWith("'")) ||
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith('`') && raw.endsWith('`'))
      ) {
        return raw.slice(1, -1);
      }
    }
  }
  return undefined;
}

/**
 * Extract the value of a specific key from an object literal argument in a decorator.
 * E.g., @ApiOperation({ summary: 'Create entry' }) → extracts 'Create entry' for key 'summary'
 * Navigates: decorator → call_expression → arguments → object → pair
 */
function extractDecoratorObjectKey(
  decoratorNode: Parser.SyntaxNode,
  key: string,
): string | undefined {
  // Navigate decorator → call_expression → arguments
  const callExpr = decoratorNode.children.find((c) => c.type === 'call_expression');
  const args =
    callExpr?.children.find((c) => c.type === 'arguments') ??
    decoratorNode.children.find((c) => c.type === 'arguments');
  if (!args) return undefined;

  // Find the object literal inside arguments
  for (const child of args.children) {
    if (child.type === 'object') {
      for (const prop of child.children) {
        if (prop.type === 'pair') {
          const keyNode = prop.childForFieldName('key') ?? prop.children[0];
          const valueNode = prop.childForFieldName('value') ?? prop.children[2];
          if (keyNode && valueNode && keyNode.text === key) {
            const raw = valueNode.text;
            if (
              (raw.startsWith("'") && raw.endsWith("'")) ||
              (raw.startsWith('"') && raw.endsWith('"'))
            ) {
              return raw.slice(1, -1);
            }
          }
        }
      }
    }
  }
  return undefined;
}

/**
 * Get the decorator name from a decorator node.
 * The call_expression's function child contains the identifier.
 * E.g., @Controller('path') → 'Controller'
 */
function getDecoratorName(decoratorNode: Parser.SyntaxNode): string {
  // tree-sitter-typescript decorator structure:
  //   decorator → '@' call_expression(identifier, arguments)
  //   decorator → '@' identifier  (for marker decorators)
  for (const child of decoratorNode.children) {
    if (child.type === 'call_expression') {
      const fn = child.childForFieldName('function') ?? child.children[0];
      if (fn) return fn.text;
    }
    if (child.type === 'identifier') {
      return child.text;
    }
  }
  return '';
}

/**
 * Extract annotationMeta from a class declaration's decorators and its methods' decorators.
 * Aggregates NestJS-style controller/route decorators into structured metadata.
 */
function extractTsAnnotationMeta(
  classNode: Parser.SyntaxNode,
  exportNode: Parser.SyntaxNode,
): CodeChunk['annotationMeta'] | undefined {
  const operationSummaries: string[] = [];
  const endpointPaths: string[] = [];
  const httpMethods: string[] = [];
  let tagName: string | undefined;

  // 1. Class-level decorators (on the export statement or the class node itself)
  const classDecorators = [
    ...exportNode.children.filter((c) => c.type === 'decorator'),
    ...classNode.children.filter((c) => c.type === 'decorator'),
  ];

  for (const dec of classDecorators) {
    const name = getDecoratorName(dec);

    if (name === 'Controller') {
      const path = extractDecoratorStringArg(dec);
      if (path && !endpointPaths.includes(path)) endpointPaths.push(path);
    } else if (name === 'ApiTags') {
      const tag = extractDecoratorStringArg(dec);
      if (tag) tagName = tag;
    }
  }

  // 2. Method-level decorators (from class body members)
  const classBody = classNode.children.find((c) => c.type === 'class_body');
  if (classBody) {
    for (let i = 0; i < classBody.children.length; i++) {
      const member = classBody.children[i]!;
      if (!CLASS_MEMBER_TYPES.has(member.type)) {
        // Decorators appear as siblings before the method in class_body
        continue;
      }

      // Collect decorators preceding this method
      const memberDecorators: Parser.SyntaxNode[] = [];
      for (let j = i - 1; j >= 0; j--) {
        const prev = classBody.children[j]!;
        if (prev.type === 'decorator') {
          memberDecorators.unshift(prev);
        } else if (prev.type !== 'comment') {
          break;
        }
      }

      for (const dec of memberDecorators) {
        const name = getDecoratorName(dec);

        if (name in TS_HTTP_DECORATORS) {
          const method = TS_HTTP_DECORATORS[name]!;
          if (!httpMethods.includes(method)) httpMethods.push(method);
          const path = extractDecoratorStringArg(dec);
          if (path && !endpointPaths.includes(path)) endpointPaths.push(path);
        } else if (name === 'ApiOperation') {
          const summary = extractDecoratorObjectKey(dec, 'summary');
          if (summary) operationSummaries.push(summary);
        }
      }
    }
  }

  // Only return annotationMeta if there's meaningful content
  if (
    operationSummaries.length === 0 &&
    endpointPaths.length === 0 &&
    httpMethods.length === 0 &&
    !tagName
  ) {
    return undefined;
  }

  return {
    ...(operationSummaries.length > 0 ? { operationSummaries } : {}),
    ...(endpointPaths.length > 0 ? { endpointPaths } : {}),
    ...(httpMethods.length > 0 ? { httpMethods } : {}),
    ...(tagName ? { tagName } : {}),
  };
}

const CHUNK_TYPE_MAP: Partial<Record<string, CodeChunk['chunkType']>> = {
  function_declaration: 'function',
  class_declaration: 'class',
  abstract_class_declaration: 'class',
  interface_declaration: 'interface',
  type_alias_declaration: 'type',
  enum_declaration: 'enum',
  lexical_declaration: 'other',
  variable_statement: 'other',
};

function getNodeName(node: Parser.SyntaxNode): string | undefined {
  const nameNode = node.childForFieldName('name');
  return nameNode?.text;
}

/**
 * Extract heritage info (superclass + interfaces) from a class or interface declaration.
 * For class_declaration / abstract_class_declaration:
 *   - extends_clause child of class_heritage → superclass (first identifier, generics stripped)
 *   - implements_clause child of class_heritage → interfaces (all type_identifier children)
 * For interface_declaration:
 *   - extends_type_clause child → interfaces (all type_identifier children)
 */
function extractHeritage(node: Parser.SyntaxNode): { superclass?: string; interfaces?: string[] } {
  // --- Classes ---
  const heritage = node.children.find((c) => c.type === 'class_heritage');
  if (heritage) {
    let superclass: string | undefined;
    const interfaces: string[] = [];

    for (const clause of heritage.children) {
      if (clause.type === 'extends_clause') {
        // First identifier or type_identifier after 'extends' keyword
        for (const child of clause.children) {
          if (child.type === 'identifier' || child.type === 'type_identifier') {
            superclass = child.text;
            break;
          }
        }
      } else if (clause.type === 'implements_clause') {
        for (const child of clause.children) {
          if (child.type === 'type_identifier') {
            interfaces.push(child.text);
          }
        }
      }
    }

    const result: { superclass?: string; interfaces?: string[] } = {};
    if (superclass) result.superclass = superclass;
    if (interfaces.length > 0) result.interfaces = interfaces;
    return result;
  }

  // --- Interfaces ---
  const extendsTypeClause = node.children.find((c) => c.type === 'extends_type_clause');
  if (extendsTypeClause) {
    const interfaces = extendsTypeClause.children
      .filter((c) => c.type === 'type_identifier')
      .map((c) => c.text);
    return interfaces.length > 0 ? { interfaces } : {};
  }

  return {};
}

function extractImports(rootNode: Parser.SyntaxNode): string[] {
  const imports: string[] = [];
  for (const child of rootNode.children) {
    if (child.type === 'import_statement') {
      const source = child.childForFieldName('source');
      if (source) {
        // Remove surrounding quotes
        const raw = source.text;
        imports.push(raw.slice(1, raw.length - 1));
      }
    }
  }
  return imports;
}

/**
 * T038: Extract named symbols from a single import_statement node.
 * e.g. `import { Foo, Bar } from './utils'` → ['Foo', 'Bar']
 */
function extractImportSymbols(importNode: Parser.SyntaxNode): string[] {
  const clause = importNode.children.find(
    (c) => c.type === 'import_clause' || c.type === 'named_imports',
  );
  if (!clause) return [];
  const symbols: string[] = [];
  // Walk to named_imports list
  const named = clause.children.find((c) => c.type === 'named_imports') ?? clause;
  for (const child of named.children) {
    if (child.type === 'import_specifier') {
      const name = child.childForFieldName('name') ?? child.children[0];
      if (name) symbols.push(name.text);
    }
  }
  return symbols;
}

/**
 * T038: Build dependencyEdges from parsed import_statement nodes.
 * Returns `{ targetPath, relation: 'imports', symbols }` per import.
 */
function buildImportEdges(
  rootNode: Parser.SyntaxNode,
): Array<{ targetPath: string; relation: string; symbols?: string[] }> {
  const edges: Array<{ targetPath: string; relation: string; symbols?: string[] }> = [];
  for (const child of rootNode.children) {
    if (child.type === 'import_statement') {
      const source = child.childForFieldName('source');
      if (!source) continue;
      const raw = source.text;
      const targetPath = raw.slice(1, raw.length - 1);
      const symbols = extractImportSymbols(child);
      const edge: { targetPath: string; relation: string; symbols?: string[] } = {
        targetPath,
        relation: 'imports',
      };
      if (symbols.length > 0) edge.symbols = symbols;
      edges.push(edge);
    }
  }
  return edges;
}

/**
 * Extract individual members (methods, fields) from a class body node.
 * This decomposes large classes into smaller, semantically meaningful chunks —
 * each method becomes its own chunk with `parentName` linking back to the class.
 */
function extractClassMembers(
  classNode: Parser.SyntaxNode,
  className: string | undefined,
  sourceLines: string[],
  filePath: string,
  relativePath: string,
  language: string,
  allImports: string[],
  importEdges: Array<{ targetPath: string; relation: string; symbols?: string[] }>,
): CodeChunk[] {
  const classBody = classNode.children.find((c) => c.type === 'class_body');
  if (!classBody) return [];

  const members: CodeChunk[] = [];

  for (let i = 0; i < classBody.children.length; i++) {
    const member = classBody.children[i]!;
    if (!CLASS_MEMBER_TYPES.has(member.type)) continue;

    const endLine = member.endPosition.row + 1;

    // Decorators and leading comments appear as sibling nodes immediately
    // preceding the method in the class body. Walk backwards to capture them.
    let effectiveStart = member.startPosition.row + 1;
    for (let j = i - 1; j >= 0; j--) {
      const prev = classBody.children[j]!;
      if (prev.type === 'decorator' || prev.type === 'comment') {
        effectiveStart = prev.startPosition.row + 1;
      } else if (prev.type !== '{') {
        break;
      }
    }
    const content = sourceLines.slice(effectiveStart - 1, endLine).join('\n');

    const memberName = getNodeName(member);
    const chunkType: CodeChunk['chunkType'] =
      member.type === 'method_definition' ? 'function' : 'other';

    members.push({
      id: makeChunkId(filePath, effectiveStart, endLine),
      filePath,
      relativePath,
      language,
      chunkType,
      name: memberName,
      content,
      startLine: effectiveStart,
      endLine,
      imports: allImports,
      exports: [],
      parentName: className,
      ...(importEdges.length > 0 ? { dependencyEdges: importEdges } : {}),
    });
  }

  return members;
}

export function parseTypeScript(
  sourceCode: string,
  filePath: string,
  relativePath: string,
  language: string,
): CodeChunk[] {
  // Choose grammar based on language
  const useTsx = language === 'tsx' || language === 'jsx' || language === 'javascript';
  const parser = getParser(useTsx);

  const tree = parser.parse(sourceCode);
  const root = tree.rootNode;
  const lines = sourceCode.split('\n');

  const allImports = extractImports(root);
  const importEdges = buildImportEdges(root);
  const chunks: CodeChunk[] = [];
  let hasDeclarations = false;

  for (const child of root.children) {
    let targetNode = child;
    let isExported = false;

    // Unwrap export_statement to get the actual declaration
    if (child.type === 'export_statement') {
      const declaration = child.childForFieldName('declaration');
      if (declaration) {
        targetNode = declaration;
        isExported = true;
      } else {
        // export { name } or export default expr — skip
        continue;
      }
    }

    if (!DECLARATION_TYPES.has(targetNode.type)) continue;

    hasDeclarations = true;
    const startLine = child.startPosition.row + 1; // 1-indexed
    const endLine = child.endPosition.row + 1; // 1-indexed

    // Include decorators: in tree-sitter-typescript, decorators are children of the
    // export_statement wrapper or the declaration node itself
    let effectiveStartLine = startLine;
    const exportDecorators = child.children.filter((c) => c.type === 'decorator');
    const targetDecorators = targetNode.children.filter((c) => c.type === 'decorator');
    const allDecorators = [...exportDecorators, ...targetDecorators];
    if (allDecorators.length > 0) {
      const firstDecoratorLine = Math.min(...allDecorators.map((d) => d.startPosition.row + 1));
      effectiveStartLine = Math.min(effectiveStartLine, firstDecoratorLine);
    }
    const content = lines.slice(effectiveStartLine - 1, endLine).join('\n');

    const chunkType: CodeChunk['chunkType'] = CHUNK_TYPE_MAP[targetNode.type] ?? 'other';
    const name = getNodeName(targetNode);
    const chunkExports = isExported && name ? [name] : [];

    // Extract hierarchy metadata for class and interface declarations
    const isClassOrInterface =
      targetNode.type === 'class_declaration' ||
      targetNode.type === 'abstract_class_declaration' ||
      targetNode.type === 'interface_declaration';
    const heritage = isClassOrInterface ? extractHeritage(targetNode) : {};

    // T118: Extract annotationMeta from decorators for class declarations
    const isClass =
      targetNode.type === 'class_declaration' || targetNode.type === 'abstract_class_declaration';
    const annotationMeta = isClass ? extractTsAnnotationMeta(targetNode, child) : undefined;

    chunks.push({
      id: makeChunkId(filePath, effectiveStartLine, endLine),
      filePath,
      relativePath,
      language,
      chunkType,
      name,
      content,
      startLine: effectiveStartLine,
      endLine,
      imports: allImports,
      exports: chunkExports,
      ...heritage,
      ...(annotationMeta ? { annotationMeta } : {}),
      ...(importEdges.length > 0 ? { dependencyEdges: importEdges } : {}),
    });

    // For class declarations, also extract individual members as sub-chunks
    if (
      targetNode.type === 'class_declaration' ||
      targetNode.type === 'abstract_class_declaration'
    ) {
      const memberChunks = extractClassMembers(
        targetNode,
        name,
        lines,
        filePath,
        relativePath,
        language,
        allImports,
        importEdges,
      );
      chunks.push(...memberChunks);
    }
  }

  // If no recognizable top-level declarations, create one module chunk
  if (!hasDeclarations) {
    chunks.push({
      id: makeChunkId(filePath, 1, lines.length),
      filePath,
      relativePath,
      language,
      chunkType: 'module',
      name: undefined,
      content: sourceCode,
      startLine: 1,
      endLine: lines.length,
      imports: allImports,
      exports: [],
      ...(importEdges.length > 0 ? { dependencyEdges: importEdges } : {}),
    });
  }

  return chunks;
}
