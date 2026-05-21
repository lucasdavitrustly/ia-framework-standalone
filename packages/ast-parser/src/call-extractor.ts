import Parser from 'tree-sitter';
import JavaLang from 'tree-sitter-java';

let javaParser: Parser | null = null;

function getJavaParser(): Parser {
  if (!javaParser) {
    javaParser = new Parser();
    javaParser.setLanguage(JavaLang as Parameters<Parser['setLanguage']>[0]);
  }
  return javaParser;
}

export interface CallInfo {
  /** The method/function name that defines this chunk */
  defines: string;
  /** Method names called within this chunk's body */
  calls: string[];
}

/**
 * Extract method invocations from a code chunk's content.
 * Uses tree-sitter to find all method_invocation nodes.
 * Returns the `defines` name and the list of called method names.
 */
export function extractCalls(
  content: string,
  language: string,
  chunkName?: string,
): CallInfo | undefined {
  if (!chunkName) return undefined;
  if (language !== 'java') return undefined; // Only Java supported initially

  const parser = getJavaParser();

  // Wrap content in a class if it's a standalone method (for valid parse)
  const wrappedContent = content.includes('class ') ? content : `class _Wrapper_ {\n${content}\n}`;
  const tree = parser.parse(wrappedContent);

  const calls = new Set<string>();
  collectMethodInvocations(tree.rootNode, calls);

  // Remove self-references and common noise
  calls.delete(chunkName);

  return {
    defines: chunkName,
    calls: [...calls],
  };
}

/**
 * Recursively collect method invocation names from AST.
 */
function collectMethodInvocations(node: Parser.SyntaxNode, calls: Set<string>): void {
  if (node.type === 'method_invocation') {
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      calls.add(nameNode.text);
    }
  }

  for (const child of node.children) {
    collectMethodInvocations(child, calls);
  }
}

/**
 * Build a reverse index (calledBy) from a set of chunks that have `defines` and `calls`.
 * For each method that is called, records which methods call it.
 */
export function buildCalledByIndex(
  chunks: Array<{ defines: string; calls: string[] }>,
): Map<string, string[]> {
  const calledBy = new Map<string, string[]>();

  for (const chunk of chunks) {
    for (const calledMethod of chunk.calls) {
      let callers = calledBy.get(calledMethod);
      if (!callers) {
        callers = [];
        calledBy.set(calledMethod, callers);
      }
      callers.push(chunk.defines);
    }
  }

  return calledBy;
}
