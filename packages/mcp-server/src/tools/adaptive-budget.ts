/**
 * Adaptive Context Budget — determines token budget based on query complexity.
 *
 * Simple queries (single file lookup, existence check) get a small budget.
 * Moderate queries (how does X work, where is Y used) get medium budget.
 * Complex queries (multi-step reasoning, cross-file, impact analysis) get full budget.
 *
 * This prevents over-retrieval on simple queries (observed: 72K tokens for +1pt gain)
 * while preserving full context for queries that need it.
 */

export type QueryComplexity = 'simple' | 'moderate' | 'complex';

export interface BudgetClassification {
  complexity: QueryComplexity;
  tokenBudget: number;
  reason: string;
}

export interface BudgetConfig {
  /** Token budget for simple queries (default: 8000) */
  simple: number;
  /** Token budget for moderate queries (default: 20000) */
  moderate: number;
  /** Token budget for complex queries (default: 40000) */
  complex: number;
}

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  simple: 8000,
  moderate: 20000,
  complex: 40000,
};

/** Patterns indicating cross-file or multi-step complexity */
const COMPLEX_PATTERNS: RegExp[] = [
  /what\s+would\s+(happen|break|change|need)/i,
  /if\s+(i|we|you)\s+(want|need|change|add|remove|modify|refactor)/i,
  /how\s+do(es)?\s+.+\s+interact/i,
  /what\s+(patterns?|inconsistenc)/i,
  /across\s+(the|all|multiple|different)\s+(project|codebase|modules?|files?|packages?)/i,
  /impact\s+(of|analysis|if)/i,
  /end.to.end|full\s+flow|entire\s+(flow|pipeline|process)/i,
  /what\s+would\s+I\s+need\s+to\s+modify/i,
  /architecture|design\s+patterns?/i,
];

/** Patterns indicating simple single-target lookup */
const SIMPLE_PATTERNS: RegExp[] = [
  /^(does|is)\s+(this|the|it|there)/i, // existence checks
  /^where\s+is\s+\w+/i, // single location lookup
  /^(find|show|get)\s+(me\s+)?(the\s+)?\w+/i, // direct lookup
  /^what\s+is\s+\w+$/i, // single definition
];

/**
 * Classify query complexity and determine appropriate token budget.
 *
 * Classification logic:
 * 1. Complex patterns (multi-step, cross-file, impact) → complex budget
 * 2. Simple patterns (existence, single lookup) → simple budget
 * 3. Word count heuristic: <=5 words → simple, <=12 → moderate, >12 → complex
 * 4. Multiple question marks or conjunctions ("and", "also") → bump up
 */
export function classifyBudget(
  query: string,
  config: BudgetConfig = DEFAULT_BUDGET_CONFIG,
): BudgetClassification {
  if (!query || query.trim().length === 0) {
    return { complexity: 'moderate', tokenBudget: config.moderate, reason: 'empty-query-default' };
  }

  const trimmed = query.trim();

  // 1. Check complex patterns first (takes priority)
  for (const pattern of COMPLEX_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { complexity: 'complex', tokenBudget: config.complex, reason: 'complex-pattern' };
    }
  }

  // 2. Check simple patterns
  for (const pattern of SIMPLE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { complexity: 'simple', tokenBudget: config.simple, reason: 'simple-pattern' };
    }
  }

  // 3. Word count heuristic
  const wordCount = trimmed.split(/\s+/).length;

  // 4. Conjunction/multi-question boost
  const hasConjunction = /\band\b|\balso\b|\badditionally\b/i.test(trimmed);
  const multipleQuestions = (trimmed.match(/\?/g) || []).length > 1;
  const boost = hasConjunction || multipleQuestions ? 1 : 0;

  if (wordCount <= 5 && boost === 0) {
    return { complexity: 'simple', tokenBudget: config.simple, reason: 'short-query' };
  }

  if (wordCount <= 12 && boost === 0) {
    return { complexity: 'moderate', tokenBudget: config.moderate, reason: 'medium-query' };
  }

  if (wordCount > 12 || boost > 0) {
    return { complexity: 'complex', tokenBudget: config.complex, reason: 'long-or-compound-query' };
  }

  return { complexity: 'moderate', tokenBudget: config.moderate, reason: 'default' };
}
