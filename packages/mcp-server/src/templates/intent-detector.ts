/**
 * Keyword-based intent detection for RAG-to-action prompt template injection.
 * Classifies search queries into actionable intents using deterministic heuristics.
 * No LLM calls — pure keyword matching for predictability and speed.
 */

export type IntentType = 'impact-analysis' | 'dependency-trace';

const IMPACT_PATTERNS: readonly string[] = [
  'what files',
  'what changes',
  'need to update',
  'need updating',
  'affects',
  'impact of',
  'if i change',
  'breaking change',
  'ripple effect',
  'what breaks',
  'what needs changing',
  'changes are needed',
  'files need updating',
];

const DEPENDENCY_PATTERNS: readonly string[] = [
  'depends on',
  'dependency chain',
  'what uses',
  'callers of',
  'imported by',
  'used by',
  'consumers of',
  'dependents of',
];

/**
 * Detect the intent of a search query for prompt template injection.
 * Returns the matched intent type, or null if no intent is detected.
 *
 * Priority: impact-analysis checked first, then dependency-trace.
 */
export function detectIntent(query: string): IntentType | null {
  if (!query) return null;

  const normalized = query.toLowerCase();

  for (const pattern of IMPACT_PATTERNS) {
    if (normalized.includes(pattern)) return 'impact-analysis';
  }

  for (const pattern of DEPENDENCY_PATTERNS) {
    if (normalized.includes(pattern)) return 'dependency-trace';
  }

  return null;
}
