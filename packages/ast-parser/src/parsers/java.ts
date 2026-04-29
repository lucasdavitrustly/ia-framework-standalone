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

/**
 * Extract the superclass name from a class_declaration node.
 * Handles both simple type_identifier and generic_type (strips type params).
 */
function extractSuperclass(node: Parser.SyntaxNode): string | undefined {
  const superclassField = node.childForFieldName('superclass');
  if (!superclassField) return undefined;
  // superclass field child is either type_identifier or generic_type
  for (const child of superclassField.children) {
    if (child.type === 'type_identifier') return child.text;
    if (child.type === 'generic_type') {
      // generic_type has type_identifier as first child
      const typeId = child.children.find((c) => c.type === 'type_identifier');
      if (typeId) return typeId.text;
    }
  }
  return undefined;
}

/**
 * Extract implemented interfaces from a class_declaration (super_interfaces field)
 * or extended interfaces from an interface_declaration (extends_interfaces field).
 */
function extractInterfaces(node: Parser.SyntaxNode): string[] | undefined {
  // class_declaration: super_interfaces field
  // interface_declaration: extends_interfaces field
  const fieldNode =
    node.childForFieldName('interfaces') ?? // super_interfaces uses field 'interfaces'
    node.children.find((c) => c.type === 'super_interfaces' || c.type === 'extends_interfaces');
  if (!fieldNode) return undefined;

  const typeList = fieldNode.children.find((c) => c.type === 'type_list');
  if (!typeList) return undefined;

  const names = typeList.children.filter((c) => c.type === 'type_identifier').map((c) => c.text);
  return names.length > 0 ? names : undefined;
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

    // Inner class (top-level declaration inside another class) gets parentName from enclosing
    if (isTopLevel && enclosingName) {
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
      ...(isTopLevel &&
      (targetNode.type === 'class_declaration' || targetNode.type === 'record_declaration')
        ? {
            superclass: extractSuperclass(targetNode),
            interfaces: extractInterfaces(targetNode),
            isInnerClass: enclosingName != null ? true : undefined,
          }
        : {}),
      ...(isTopLevel && targetNode.type === 'interface_declaration'
        ? {
            interfaces: extractInterfaces(targetNode),
            isInnerClass: enclosingName != null ? true : undefined,
          }
        : {}),
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
