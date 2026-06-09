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

function makeClassSignatureChunkId(filePath: string, startLine: number, endLine: number): string {
  return createHash('sha1').update(`${filePath}:sig:${startLine}:${endLine}`).digest('hex');
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
 * T037: Convert Java import paths to DependencyEdge objects.
 * `com.example.Foo` → { targetPath: 'com/example/Foo.java', relation: 'imports', symbols: ['Foo'] }
 */
function importsToDependencyEdges(
  imports: string[],
): Array<{ targetPath: string; relation: string; symbols?: string[] }> {
  return imports.map((imp) => {
    const parts = imp.split('.');
    const symbol = parts[parts.length - 1] ?? imp;
    const targetPath = imp.replace(/\./g, '/') + '.java';
    return { targetPath, relation: 'imports', symbols: [symbol] };
  });
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
 * Check whether a class_declaration node has an @Aspect annotation in its modifiers.
 */
function hasAspectAnnotation(classNode: Parser.SyntaxNode): boolean {
  const modifiers =
    classNode.childForFieldName('modifiers') ??
    classNode.children.find((c) => c.type === 'modifiers');
  if (!modifiers) return false;
  return modifiers.children.some(
    (c) => (c.type === 'marker_annotation' || c.type === 'annotation') && c.text.includes('Aspect'),
  );
}

// ── T024: annotations and visibility helpers ────────────────────────────────

function getModifiers(node: Parser.SyntaxNode): Parser.SyntaxNode | undefined {
  return (
    node.childForFieldName('modifiers') ??
    node.children.find((c) => c.type === 'modifiers') ??
    undefined
  );
}

function extractAnnotations(node: Parser.SyntaxNode): string[] {
  const modifiers = getModifiers(node);
  if (!modifiers) return [];
  return modifiers.children
    .filter((c) => c.type === 'marker_annotation' || c.type === 'annotation')
    .map((c) => c.text);
}

// ── T117: Annotation value extraction for annotationMeta ────────────────────

/** HTTP method mapping: annotation name → HTTP method */
const HTTP_MAPPING_ANNOTATIONS: Record<string, string> = {
  GetMapping: 'GET',
  PostMapping: 'POST',
  PutMapping: 'PUT',
  DeleteMapping: 'DELETE',
  PatchMapping: 'PATCH',
};

/**
 * Extract the string value from an annotation's arguments.
 * Handles: @Foo("value"), @Foo(key = "value"), @Foo(value = "value")
 * Returns the first string literal value found, or the value of a specific key.
 */
function extractAnnotationStringValue(
  annotationNode: Parser.SyntaxNode,
  key?: string,
): string | undefined {
  const args =
    annotationNode.childForFieldName('arguments') ??
    annotationNode.children.find((c) => c.type === 'annotation_argument_list');
  if (!args) return undefined;

  for (const child of args.children) {
    if (child.type === 'element_value_pair') {
      const keyNode = child.childForFieldName('key') ?? child.children[0];
      const valueNode =
        child.childForFieldName('value') ?? child.children.find((c) => c.type === 'string_literal');
      if (keyNode && valueNode) {
        const keyText = keyNode.text;
        if (!key || keyText === key || keyText === 'value') {
          // Strip surrounding quotes from string literal
          const raw = valueNode.text;
          if (raw.startsWith('"') && raw.endsWith('"')) {
            return raw.slice(1, -1);
          }
        }
      }
    } else if (child.type === 'string_literal') {
      // Direct value: @Foo("value")
      const raw = child.text;
      if (raw.startsWith('"') && raw.endsWith('"')) {
        return raw.slice(1, -1);
      }
    }
  }
  return undefined;
}

/**
 * Get the annotation name from a marker_annotation or annotation node.
 * E.g., "@Operation(...)" → "Operation", "@RestController" → "RestController"
 */
function getAnnotationName(annotationNode: Parser.SyntaxNode): string {
  const nameNode =
    annotationNode.childForFieldName('name') ??
    annotationNode.children.find((c) => c.type === 'identifier');
  return nameNode?.text ?? annotationNode.text.replace(/^@/, '').split('(')[0] ?? '';
}

/**
 * Extract annotationMeta from a class declaration and its methods.
 * Aggregates:
 * - @Operation(summary=...) from methods → operationSummaries
 * - @Tag(name=...) from class → tagName
 * - @RequestMapping("...") from class → endpointPaths
 * - @GetMapping/@PostMapping/... from methods → httpMethods + endpointPaths
 */
function extractAnnotationMeta(
  classNode: Parser.SyntaxNode,
): CodeChunk['annotationMeta'] | undefined {
  const operationSummaries: string[] = [];
  const endpointPaths: string[] = [];
  const httpMethods: string[] = [];
  let tagName: string | undefined;

  // 1. Class-level annotations
  const classModifiers = getModifiers(classNode);
  if (classModifiers) {
    for (const ann of classModifiers.children) {
      if (ann.type !== 'annotation' && ann.type !== 'marker_annotation') continue;
      const name = getAnnotationName(ann);

      if (name === 'RequestMapping') {
        const path = extractAnnotationStringValue(ann, 'value');
        if (path) endpointPaths.push(path);
      } else if (name === 'Tag') {
        const nameVal = extractAnnotationStringValue(ann, 'name');
        if (nameVal) tagName = nameVal;
      }
    }
  }

  // 2. Method-level annotations (from class body)
  const classBody = classNode.children.find((c) => c.type === 'class_body');
  if (classBody) {
    for (const member of classBody.children) {
      if (member.type !== 'method_declaration' && member.type !== 'constructor_declaration') {
        continue;
      }
      const memberModifiers = getModifiers(member);
      if (!memberModifiers) continue;

      for (const ann of memberModifiers.children) {
        if (ann.type !== 'annotation' && ann.type !== 'marker_annotation') continue;
        const name = getAnnotationName(ann);

        if (name === 'Operation') {
          const summary = extractAnnotationStringValue(ann, 'summary');
          if (summary) operationSummaries.push(summary);
        } else if (name in HTTP_MAPPING_ANNOTATIONS) {
          const method = HTTP_MAPPING_ANNOTATIONS[name]!;
          if (!httpMethods.includes(method)) httpMethods.push(method);
          const path = extractAnnotationStringValue(ann, 'value');
          if (path && !endpointPaths.includes(path)) endpointPaths.push(path);
        } else if (name === 'RequestMapping') {
          const path = extractAnnotationStringValue(ann, 'value');
          if (path && !endpointPaths.includes(path)) endpointPaths.push(path);
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

function extractVisibility(
  node: Parser.SyntaxNode,
): 'public' | 'protected' | 'private' | 'package' {
  const modifiers = getModifiers(node);
  if (!modifiers) return 'package';
  for (const c of modifiers.children) {
    const txt = c.text;
    if (txt === 'public') return 'public';
    if (txt === 'protected') return 'protected';
    if (txt === 'private') return 'private';
  }
  return 'package';
}

// ── T025: contextHeader and class-signature helpers ─────────────────────────

/**
 * Build a contextHeader for method chunks:
 * class declaration line + field declarations, at most 5 non-empty lines total.
 */
function buildContextHeader(classNode: Parser.SyntaxNode, sourceLines: string[]): string {
  const headerLines: string[] = [];

  // Find the class/interface/enum/record declaration line
  const startRow = classNode.startPosition.row;
  const endRow = classNode.endPosition.row;
  for (let r = startRow; r <= Math.min(endRow, startRow + 10); r++) {
    const line = sourceLines[r] ?? '';
    if (/\b(class|interface|enum|record)\b/.test(line)) {
      headerLines.push(line.trimEnd());
      break;
    }
  }

  // Add field declarations (first line of each) until we have 5 non-empty lines
  const classBody = classNode.children.find(
    (c) => c.type === 'class_body' || c.type === 'interface_body' || c.type === 'enum_body',
  );
  if (classBody) {
    for (const child of classBody.children) {
      if (child.type !== 'field_declaration') continue;
      const firstLine = sourceLines[child.startPosition.row]?.trimEnd();
      if (firstLine != null && firstLine.trim().length > 0) {
        headerLines.push(firstLine);
      }
      if (headerLines.filter((l) => l.trim().length > 0).length >= 5) break;
    }
  }

  return headerLines.join('\n');
}

/**
 * Return the method signature (everything up to but not including the body block),
 * with the opening brace replaced by '{ }' to indicate an empty stub.
 */
function getMethodSignatureLine(methodNode: Parser.SyntaxNode, sourceLines: string[]): string {
  const bodyNode = methodNode.childForFieldName('body');
  if (!bodyNode) {
    // Abstract method — no body
    return sourceLines
      .slice(methodNode.startPosition.row, methodNode.endPosition.row + 1)
      .join('\n')
      .trimEnd();
  }
  const bodyStartRow = bodyNode.startPosition.row;
  const bodyStartCol = bodyNode.startPosition.column;
  const sigLines = sourceLines.slice(methodNode.startPosition.row, bodyStartRow + 1);
  if (sigLines.length > 0) {
    sigLines[sigLines.length - 1] =
      (sourceLines[bodyStartRow] ?? '').substring(0, bodyStartCol).trimEnd() + ' { }';
  }
  return sigLines.join('\n').trimEnd();
}

/**
 * Build the content for a class-signature chunk:
 * class declaration + field declarations + method signatures (no bodies).
 */
function buildClassSignatureContent(classNode: Parser.SyntaxNode, sourceLines: string[]): string {
  const parts: string[] = [];

  // 1. Class declaration line
  const startRow = classNode.startPosition.row;
  const endRow = classNode.endPosition.row;
  for (let r = startRow; r <= Math.min(endRow, startRow + 10); r++) {
    const line = sourceLines[r] ?? '';
    if (/\b(class|interface|enum|record)\b/.test(line)) {
      parts.push(line.trimEnd());
      break;
    }
  }

  // 2. Class body: fields and method/constructor signatures (no bodies)
  const classBody = classNode.children.find((c) => c.type === 'class_body');
  if (classBody) {
    for (const child of classBody.children) {
      if (child.type === 'field_declaration') {
        parts.push(
          sourceLines
            .slice(child.startPosition.row, child.endPosition.row + 1)
            .join('\n')
            .trimEnd(),
        );
      } else if (child.type === 'method_declaration' || child.type === 'constructor_declaration') {
        parts.push(getMethodSignatureLine(child, sourceLines));
      }
    }
    parts.push('}');
  }

  return parts.join('\n');
}

/**
 * Build preamble string for method chunks: package + import lines + class/interface signature.
 * The preamble gives each method chunk enough context to be independently comprehensible.
 */
function buildPreamble(
  rootNode: Parser.SyntaxNode,
  enclosingNode: Parser.SyntaxNode,
  sourceLines: string[],
  includeClassAnnotations = false,
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

  // 3. Optionally include class-level annotations (for @Aspect methods)
  if (includeClassAnnotations) {
    const modifiers =
      enclosingNode.childForFieldName('modifiers') ??
      enclosingNode.children.find((c) => c.type === 'modifiers');
    if (modifiers) {
      for (const c of modifiers.children) {
        if (c.type === 'marker_annotation' || c.type === 'annotation') {
          parts.push(c.text);
        }
      }
    }
  }

  // 4. Enclosing class/interface signature line — search for the line containing `class` or
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

    // For top-level class declarations, check for @Aspect annotation
    if (isTopLevel && targetNode.type === 'class_declaration' && hasAspectAnnotation(targetNode)) {
      // Determine if class node itself has preceding annotation siblings
      const rawContent = sourceLines.slice(startLine - 1, endLine).join('\n');
      const name = getNodeName(targetNode);
      chunks.push({
        id: makeChunkId(filePath, startLine, endLine),
        filePath,
        relativePath,
        language: 'java',
        chunkType: 'aspect',
        name,
        content: rawContent,
        startLine,
        endLine,
        imports: allImports,
        exports: name ? [name] : [],
        parentName: enclosingName,
        superclass: extractSuperclass(targetNode),
        interfaces: extractInterfaces(targetNode),
        isInnerClass: enclosingName != null ? true : undefined,
        annotations: extractAnnotations(targetNode),
        visibility: extractVisibility(targetNode),
        ...(allImports.length > 0 ? { dependencyEdges: importsToDependencyEdges(allImports) } : {}),
      });
      // Do NOT recurse — entire @Aspect class is emitted as one chunk
      continue;
    }

    // For member declarations (methods, constructors, fields), include preceding annotations
    let effectiveStartLine = startLine;
    if (isMember) {
      const siblings = node.children;
      const siblingIndex = siblings.indexOf(child);
      for (let i = siblingIndex - 1; i >= 0; i--) {
        const prev = siblings[i]!;
        if (prev.type === 'marker_annotation' || prev.type === 'annotation') {
          effectiveStartLine = prev.startPosition.row + 1;
        } else if (prev.type === 'modifiers') {
          effectiveStartLine = prev.startPosition.row + 1;
          break;
        } else {
          break;
        }
      }
    }

    const rawContent = sourceLines.slice(effectiveStartLine - 1, endLine).join('\n');

    const chunkType: CodeChunk['chunkType'] = CHUNK_TYPE_MAP[targetNode.type] ?? 'other';
    const name = getNodeName(targetNode);

    let content = rawContent;
    let parentName: string | undefined;

    // Method/constructor members inside a class/interface get preamble + parentName
    let contextHeader: string | undefined;
    if (isMember && enclosingNode && rootNode && enclosingName) {
      const isInsideAspect = hasAspectAnnotation(enclosingNode);
      const preamble = buildPreamble(rootNode, enclosingNode, sourceLines, isInsideAspect);
      content = preamble + '\n\n' + rawContent;
      parentName = enclosingName;
      // T025: set contextHeader for method/constructor chunks
      if (chunkType === 'function' || chunkType === 'method') {
        contextHeader = buildContextHeader(enclosingNode, sourceLines);
      }
    }

    // Inner class (top-level declaration inside another class) gets parentName from enclosing
    if (isTopLevel && enclosingName) {
      parentName = enclosingName;
    }

    chunks.push({
      id: makeChunkId(filePath, effectiveStartLine, endLine),
      filePath,
      relativePath,
      language: 'java',
      chunkType,
      name,
      content,
      startLine: effectiveStartLine,
      endLine,
      imports: allImports,
      exports: name ? [name] : [],
      parentName,
      annotations: extractAnnotations(targetNode),
      visibility: extractVisibility(targetNode),
      ...(contextHeader != null ? { contextHeader } : {}),
      ...(allImports.length > 0 ? { dependencyEdges: importsToDependencyEdges(allImports) } : {}),
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

    // T025: emit class-signature chunk for top-level class/record declarations
    if (
      isTopLevel &&
      (targetNode.type === 'class_declaration' || targetNode.type === 'record_declaration')
    ) {
      const className = getNodeName(targetNode);
      const sigContent = buildClassSignatureContent(targetNode, sourceLines);
      // T117: extract structured annotation values for thin-class enrichment
      const annotationMeta = extractAnnotationMeta(targetNode);
      chunks.push({
        id: makeClassSignatureChunkId(filePath, startLine, endLine),
        filePath,
        relativePath,
        language: 'java',
        chunkType: 'class-signature',
        name: className,
        content: sigContent,
        startLine,
        endLine,
        imports: allImports,
        exports: className ? [className] : [],
        parentName: enclosingName,
        annotations: extractAnnotations(targetNode),
        visibility: extractVisibility(targetNode),
        ...(annotationMeta ? { annotationMeta } : {}),
        ...(allImports.length > 0 ? { dependencyEdges: importsToDependencyEdges(allImports) } : {}),
      });
    }

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
      ...(allImports.length > 0 ? { dependencyEdges: importsToDependencyEdges(allImports) } : {}),
    });
  }

  return chunks;
}
