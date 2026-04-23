/**
 * Heuristic quality scoring for LLM-generated chunk summaries.
 * Scores 0-100 based on: length, absence of code tokens, presence of purpose verbs, syntax patterns.
 *
 * Per plan 20-02: enables identification of low-quality summaries without manual review.
 */

export interface SummaryQualityScore {
  score: number; // 0-100
  checks: {
    /** 0-25: min length needed for any points; 50+ chars for full marks */
    lengthScore: number;
    /** 0-25: penalize camelCase/snake_case identifiers */
    codeTokenScore: number;
    /** 0-25: presence of purpose verbs like handles/validates/orchestrates */
    purposeVerbScore: number;
    /** 0-25: penalize "takes X and returns Y" / "this function" patterns */
    syntaxPenalty: number;
  };
}

/** Purpose verbs that indicate a descriptive, domain-level summary */
const PURPOSE_VERBS = [
  'handles',
  'validates',
  'orchestrates',
  'manages',
  'transforms',
  'routes',
  'provides',
  'implements',
  'configures',
  'processes',
  'creates',
  'defines',
  'exports',
  'initializes',
];

/** Regex to detect camelCase word: starts with lowercase, contains an uppercase transition */
const CAMEL_CASE_RE = /[a-z][a-zA-Z]*[A-Z][a-zA-Z]*/;

/** Regex to detect snake_case word */
const SNAKE_CASE_RE = /[a-z]+_[a-z]+/;

/**
 * Compute a heuristic quality score for an LLM-generated chunk summary.
 *
 * Score = lengthScore + codeTokenScore + purposeVerbScore + syntaxPenalty (each 0-25).
 */
export function scoreChunkSummary(summary: string): SummaryQualityScore {
  const zero: SummaryQualityScore = {
    score: 0,
    checks: { lengthScore: 0, codeTokenScore: 0, purposeVerbScore: 0, syntaxPenalty: 0 },
  };

  if (!summary || summary.trim() === '') return zero;

  const trimmed = summary.trim();

  // Very short strings (< 10 chars) are meaningless summaries — score 0
  if (trimmed.length < 10) return zero;

  // --- Length Score (0-25) ---
  let lengthScore: number;
  if (trimmed.length < 20) {
    lengthScore = 5;
  } else if (trimmed.length < 50) {
    lengthScore = 15;
  } else {
    lengthScore = 25;
  }

  // --- Code Token Score (0-25) ---
  // Count words that look like identifiers (camelCase or snake_case)
  const words = trimmed.split(/\s+/);
  const codeTokenCount = words.filter((w) => CAMEL_CASE_RE.test(w) || SNAKE_CASE_RE.test(w)).length;

  let codeTokenScore: number;
  if (codeTokenCount === 0) {
    codeTokenScore = 25;
  } else if (codeTokenCount <= 2) {
    codeTokenScore = 15;
  } else if (codeTokenCount <= 5) {
    codeTokenScore = 5;
  } else {
    codeTokenScore = 0;
  }

  // --- Purpose Verb Score (0-25) ---
  const lower = trimmed.toLowerCase();
  const verbCount = PURPOSE_VERBS.filter((v) => lower.includes(v)).length;
  const purposeVerbScore = verbCount >= 2 ? 25 : verbCount === 1 ? 15 : 0;

  // --- Syntax Penalty (0-25) ---
  // 0 = heavy penalty (bad pattern detected)
  // 25 = no penalty (clean description)
  let syntaxPenalty: number;

  // Heavy penalty: all words are code identifiers (no natural language at all)
  const allCodeTokens = codeTokenCount > 0 && codeTokenCount >= words.length;

  if (
    allCodeTokens ||
    /this function takes/i.test(trimmed) ||
    /takes .* and returns/i.test(trimmed) ||
    /accepts .* parameter/i.test(trimmed)
  ) {
    syntaxPenalty = 0;
  } else if (/\breturns\b/i.test(trimmed) && verbCount === 0) {
    // Contains "returns" but no purpose verb → slight penalty
    syntaxPenalty = 10;
  } else {
    syntaxPenalty = 25;
  }

  const score = lengthScore + codeTokenScore + purposeVerbScore + syntaxPenalty;

  return {
    score,
    checks: { lengthScore, codeTokenScore, purposeVerbScore, syntaxPenalty },
  };
}
