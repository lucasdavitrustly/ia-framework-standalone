/**
 * Query complexity classifier — deterministic heuristics to classify queries
 * as 'keyword' (best served by vector keyword/exact search) or 'semantic'
 * (best served by semantic/embedding search).
 *
 * No LLM calls — pure pattern matching for speed and predictability.
 */

export type QueryType = 'keyword' | 'semantic';

export interface QueryClassification {
  type: QueryType;
  reason: string;
  confidence: number; // 0-1
}

export interface ClassificationRules {
  symbolPatterns?: RegExp[];
  lookupVerbs?: string[];
  maxKeywordWords?: number;
}

export const DEFAULT_RULES: ClassificationRules = {
  symbolPatterns: [
    /^[a-z]+[A-Z]/, // camelCase (e.g. getUserById)
    /\w+\.\w+/, // dot-notation (e.g. fs.readFileSync)
    /[A-Z][a-z]+[A-Z]/, // PascalCase with multiple words (e.g. UserService)
    /^[A-Z][A-Za-z]+$/, // Single PascalCase word (e.g. Database)
  ],
  lookupVerbs: ['find', 'where', 'locate', 'show', 'get', 'what is'],
  maxKeywordWords: 6,
};

/**
 * Classify a query as 'keyword' or 'semantic'.
 * Classification order:
 * 1. Quoted substring → keyword
 * 2. Symbol pattern match → keyword
 * 3. Lookup verb at start + short query → keyword
 * 4. Short identifier-like words → keyword
 * 5. Default → semantic
 */
export function classifyQuery(query: string, rules?: ClassificationRules): QueryClassification {
  if (!query) {
    return { type: 'semantic', reason: 'default', confidence: 0.5 };
  }

  const mergedRules: Required<ClassificationRules> = {
    symbolPatterns: rules?.symbolPatterns ?? DEFAULT_RULES.symbolPatterns!,
    lookupVerbs: rules?.lookupVerbs ?? DEFAULT_RULES.lookupVerbs!,
    maxKeywordWords: rules?.maxKeywordWords ?? DEFAULT_RULES.maxKeywordWords!,
  };

  // 1. Quoted strings
  if (/["'][^"']+["']/.test(query)) {
    return { type: 'keyword', reason: 'quoted-string', confidence: 1.0 };
  }

  // 2. Symbol patterns
  const symbolReasons = [
    'symbol-camelcase',
    'symbol-dotnotation',
    'symbol-pascalcase',
    'symbol-pascalcase',
  ];
  for (let i = 0; i < mergedRules.symbolPatterns.length; i++) {
    if (mergedRules.symbolPatterns[i]!.test(query)) {
      const reason: string = i < symbolReasons.length ? symbolReasons[i]! : 'symbol-pattern';
      return { type: 'keyword', reason, confidence: 1.0 };
    }
  }

  // 3. Lookup verbs
  const normalized = query.toLowerCase();
  const wordCount = query.trim().split(/\s+/).length;
  if (wordCount <= mergedRules.maxKeywordWords) {
    for (const verb of mergedRules.lookupVerbs) {
      if (normalized.startsWith(verb + ' ') || normalized === verb) {
        return { type: 'keyword', reason: 'lookup-verb', confidence: 0.8 };
      }
    }
  }

  // 4. Short identifier-like (<=3 words, all look like identifiers)
  if (wordCount <= 3) {
    const words = query.trim().split(/\s+/);
    const allIdentifiers = words.every((w) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(w));
    if (allIdentifiers && words.some((w) => /[A-Z]/.test(w))) {
      return { type: 'keyword', reason: 'short-identifier', confidence: 0.6 };
    }
  }

  // 5. Default → semantic
  return { type: 'semantic', reason: 'default', confidence: 0.5 };
}
