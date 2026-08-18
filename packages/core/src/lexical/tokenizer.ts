/** Versioned lexical contract shared by sparse retrieval and reranking. */
export const TOKENIZER_VERSION = 1;

/**
 * Split code-aware lexical terms while preserving quoted phrases as one term.
 * Case boundaries are split before lowercasing so identifier structure survives.
 */
export function tokenize(text: string): string[] {
  const terms: string[] = [];
  const quotedPattern = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let lastIndex = 0;

  for (const match of text.matchAll(quotedPattern)) {
    const matchIndex = match.index ?? 0;
    terms.push(...tokenizeUnquoted(text.slice(lastIndex, matchIndex)));
    terms.push(match[1] ?? '');
    lastIndex = matchIndex + match[0].length;
  }

  terms.push(...tokenizeUnquoted(text.slice(lastIndex)));
  return terms.filter((term) => term.length > 0);
}

function tokenizeUnquoted(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter((term) => term.length > 0)
    .map((term) => term.toLowerCase());
}
