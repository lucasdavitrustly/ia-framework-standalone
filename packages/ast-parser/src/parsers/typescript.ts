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
): CodeChunk[] {
  const classBody = classNode.children.find((c) => c.type === 'class_body');
  if (!classBody) return [];

  const members: CodeChunk[] = [];

  for (const member of classBody.children) {
    if (!CLASS_MEMBER_TYPES.has(member.type)) continue;

    const startLine = member.startPosition.row + 1;
    const endLine = member.endPosition.row + 1;
    const content = sourceLines.slice(startLine - 1, endLine).join('\n');

    const memberName = getNodeName(member);
    const chunkType: CodeChunk['chunkType'] =
      member.type === 'method_definition' ? 'function' : 'other';

    members.push({
      id: makeChunkId(filePath, startLine, endLine),
      filePath,
      relativePath,
      language,
      chunkType,
      name: memberName,
      content,
      startLine,
      endLine,
      imports: allImports,
      exports: [],
      parentName: className,
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
    const content = lines.slice(startLine - 1, endLine).join('\n');

    const chunkType: CodeChunk['chunkType'] = CHUNK_TYPE_MAP[targetNode.type] ?? 'other';
    const name = getNodeName(targetNode);
    const chunkExports = isExported && name ? [name] : [];

    chunks.push({
      id: makeChunkId(filePath, startLine, endLine),
      filePath,
      relativePath,
      language,
      chunkType,
      name,
      content,
      startLine,
      endLine,
      imports: allImports,
      exports: chunkExports,
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
    });
  }

  return chunks;
}
