import Parser from 'tree-sitter';
import JavaLang from 'tree-sitter-java';
import { createHash } from 'node:crypto';
import type { CodeChunk } from '../types.js';

let javaParser: Parser | null = null;

function getParser(): Parser {
  if (!javaParser) {
    javaParser = new Parser();
    javaParser.setLanguage(JavaLang as Parameters<Parser['setLanguage']>[0]);
  }
  return javaParser;
}

function makeChunkId(filePath: string, startLine: number, endLine: number): string {
  return createHash('sha1').update(`${filePath}:${startLine}:${endLine}`).digest('hex');
}

// Java top-level declaration types we want to chunk
const DECLARATION_TYPES = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
  'annotation_type_declaration',
  'method_declaration',
  'constructor_declaration',
  'field_declaration',
]);

const CHUNK_TYPE_MAP: Partial<Record<string, CodeChunk['chunkType']>> = {
  class_declaration: 'class',
  interface_declaration: 'interface',
  enum_declaration: 'enum',
  record_declaration: 'class',
  annotation_type_declaration: 'interface',
  method_declaration: 'function',
  constructor_declaration: 'function',
  field_declaration: 'other',
};

function getNodeName(node: Parser.SyntaxNode): string | undefined {
  const nameNode = node.childForFieldName('name');
  return nameNode?.text;
}

function extractImports(rootNode: Parser.SyntaxNode): string[] {
  const imports: string[] = [];
  for (const child of rootNode.children) {
    if (child.type === 'import_declaration') {
      // Extract the full import path (e.g., "java.util.List")
      // The import_declaration has children: 'import', optional 'static', scoped_identifier, ';'
      for (const sub of child.children) {
        if (sub.type === 'scoped_identifier' || sub.type === 'identifier') {
          imports.push(sub.text);
          break;
        }
      }
    }
  }
  return imports;
}

/**
 * Recursively collect declarations from a node and its class/interface body children.
 * Java classes contain methods, fields, and inner classes in their body nodes.
 */
function collectDeclarations(
  node: Parser.SyntaxNode,
  sourceLines: string[],
  filePath: string,
  relativePath: string,
  allImports: string[],
  chunks: CodeChunk[],
): void {
  for (const child of node.children) {
    let targetNode = child;

    // In Java, modifiers (public, private, static) are separate nodes — skip them.
    // The actual declaration is the child itself if it matches DECLARATION_TYPES.
    if (!DECLARATION_TYPES.has(targetNode.type)) {
      // Check class_body, interface_body, enum_body for nested declarations
      if (
        targetNode.type === 'class_body' ||
        targetNode.type === 'interface_body' ||
        targetNode.type === 'enum_body'
      ) {
        collectDeclarations(targetNode, sourceLines, filePath, relativePath, allImports, chunks);
      }
      continue;
    }

    const startLine = child.startPosition.row + 1;
    const endLine = child.endPosition.row + 1;
    const content = sourceLines.slice(startLine - 1, endLine).join('\n');

    const chunkType: CodeChunk['chunkType'] = CHUNK_TYPE_MAP[targetNode.type] ?? 'other';
    const name = getNodeName(targetNode);

    chunks.push({
      id: makeChunkId(filePath, startLine, endLine),
      filePath,
      relativePath,
      language: 'java',
      chunkType,
      name,
      content,
      startLine,
      endLine,
      imports: allImports,
      exports: name ? [name] : [],
    });

    // Recurse into class/interface bodies for inner declarations
    for (const sub of targetNode.children) {
      if (
        sub.type === 'class_body' ||
        sub.type === 'interface_body' ||
        sub.type === 'enum_body'
      ) {
        collectDeclarations(sub, sourceLines, filePath, relativePath, allImports, chunks);
      }
    }
  }
}

export function parseJava(
  sourceCode: string,
  filePath: string,
  relativePath: string,
): CodeChunk[] {
  const parser = getParser();
  const tree = parser.parse(sourceCode);
  const root = tree.rootNode;
  const lines = sourceCode.split('\n');

  const allImports = extractImports(root);
  const chunks: CodeChunk[] = [];

  collectDeclarations(root, lines, filePath, relativePath, allImports, chunks);

  // If no recognizable declarations, create one module chunk
  if (chunks.length === 0) {
    chunks.push({
      id: makeChunkId(filePath, 1, lines.length),
      filePath,
      relativePath,
      language: 'java',
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
