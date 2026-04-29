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
 * Extract package declaration text from root node (e.g., "package com.example.service;")
 */
function extractPackage(rootNode: Parser.SyntaxNode): string {
  for (const child of rootNode.children) {
    if (child.type === 'package_declaration') {
      return child.text;
    }
  }
  return '';
}

/**
 * Build preamble string for method chunks: package + import lines + class/interface signature.
 * The preamble gives each method chunk enough context to be independently comprehensible.
 */
function buildPreamble(
  rootNode: Parser.SyntaxNode,
  enclosingNode: Parser.SyntaxNode,
  sourceLines: string[],
): string {
  const parts: string[] = [];

  // 1. Package declaration
  const pkg = extractPackage(rootNode);
  if (pkg) {
    parts.push(pkg);
  }

  // 2. Import declarations
  for (const child of rootNode.children) {
    if (child.type === 'import_declaration') {
      parts.push(child.text);
    }
  }

  // 3. Enclosing class/interface signature line — search for the line containing `class` or
  //    `interface` keyword within the declaration node, since annotations may precede it.
  const declStartRow = enclosingNode.startPosition.row; // 0-indexed
  const declEndRow = enclosingNode.endPosition.row;
  let signatureLine = sourceLines[declStartRow] ?? '';
  for (let r = declStartRow; r <= Math.min(declEndRow, declStartRow + 10); r++) {
    const line = sourceLines[r] ?? '';
    if (/\b(class|interface|enum|record)\b/.test(line)) {
      signatureLine = line;
      break;
    }
  }
  parts.push(signatureLine.trimEnd());

  return parts.join('\n');
}

const MEMBER_DECLARATION_TYPES = new Set([
  'method_declaration',
  'constructor_declaration',
  'field_declaration',
]);

const TOP_LEVEL_DECLARATION_TYPES = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
  'annotation_type_declaration',
]);

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
  rootNode?: Parser.SyntaxNode,
  enclosingNode?: Parser.SyntaxNode,
  enclosingName?: string,
): void {
  for (const child of node.children) {
    const targetNode = child;
    const isTopLevel = TOP_LEVEL_DECLARATION_TYPES.has(targetNode.type);
    const isMember = MEMBER_DECLARATION_TYPES.has(targetNode.type);

    if (!isTopLevel && !isMember) {
      // Check class_body, interface_body, enum_body for nested declarations
      if (
        targetNode.type === 'class_body' ||
        targetNode.type === 'interface_body' ||
        targetNode.type === 'enum_body'
      ) {
        collectDeclarations(
          targetNode,
          sourceLines,
          filePath,
          relativePath,
          allImports,
          chunks,
          rootNode,
          enclosingNode,
          enclosingName,
        );
      }
      continue;
    }

    const startLine = child.startPosition.row + 1;
    const endLine = child.endPosition.row + 1;
    const rawContent = sourceLines.slice(startLine - 1, endLine).join('\n');

    const chunkType: CodeChunk['chunkType'] = CHUNK_TYPE_MAP[targetNode.type] ?? 'other';
    const name = getNodeName(targetNode);

    let content = rawContent;
    let parentName: string | undefined;

    // Method/constructor members inside a class/interface get preamble + parentName
    if (isMember && enclosingNode && rootNode && enclosingName) {
      const preamble = buildPreamble(rootNode, enclosingNode, sourceLines);
      content = preamble + '\n\n' + rawContent;
      parentName = enclosingName;
    }

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
      parentName,
    });

    // Recurse into class/interface bodies for inner declarations — pass enclosing context
    if (isTopLevel) {
      for (const sub of targetNode.children) {
        if (
          sub.type === 'class_body' ||
          sub.type === 'interface_body' ||
          sub.type === 'enum_body'
        ) {
          collectDeclarations(
            sub,
            sourceLines,
            filePath,
            relativePath,
            allImports,
            chunks,
            rootNode ?? node,
            targetNode,
            name,
          );
        }
      }
    }
  }
}

export function parseJava(sourceCode: string, filePath: string, relativePath: string): CodeChunk[] {
  const parser = getParser();
  const tree = parser.parse(sourceCode);
  const root = tree.rootNode;
  const lines = sourceCode.split('\n');

  const allImports = extractImports(root);
  const chunks: CodeChunk[] = [];

  collectDeclarations(
    root,
    lines,
    filePath,
    relativePath,
    allImports,
    chunks,
    root,
    undefined,
    undefined,
  );

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
