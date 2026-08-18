/**
 * BUD-13 calibration bound. The estimator is calibrated to never under-report
 * the repository's existing length/4 baseline for the tested source corpus.
 */
export const TOKEN_ESTIMATE_UNDERREPORT_MARGIN = 0;

/** Per-character weights shared by both estimators. */
function weighCharacters(text: string): { weighted: number; hasNonAscii: boolean } {
  let weighted = 0;
  let hasNonAscii = false;
  for (const character of text) {
    if (character.codePointAt(0)! > 0x7f) {
      hasNonAscii = true;
      weighted += 1;
    } else if (/\s/.test(character) || /[a-zA-Z0-9]/.test(character)) {
      weighted += 0.25;
    } else {
      weighted += 0.5;
    }
  }
  return { weighted, hasNonAscii };
}

/**
 * Estimate tokens conservatively without a model-specific tokenizer.
 * ASCII prose/code uses a four-character baseline; symbols and Unicode receive
 * a higher weight because length/4 under-reports those inputs.
 *
 * Deliberately pessimistic for any text containing non-ASCII: the estimate is
 * floored at the character count. This governs response-budget accounting, where
 * over-reserving is safe and under-reserving would overrun the caller's budget.
 * For sizing a provider *input* against a hard context limit, use
 * `estimateProviderInputTokens`, which does not apply that whole-string floor.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  const { weighted, hasNonAscii } = weighCharacters(text);
  const weightedEstimate = Math.ceil(weighted);
  return hasNonAscii ? Math.max(weightedEstimate, Array.from(text).length) : weightedEstimate;
}

/**
 * Estimate tokens for text sent to an embedding/generation provider as INPUT,
 * measured against that provider's hard context limit.
 *
 * Identical to `estimateTokens` except that it omits the whole-string
 * non-ASCII floor. That floor is correct for budget accounting but wrong here:
 * a source file containing a handful of Unicode characters (e.g. three curly
 * apostrophes in comments) would be inflated to its full character count —
 * measured at 3.66x — pushing a chunk that comfortably fits over the limit and
 * causing it to be dropped from the index entirely.
 *
 * Non-ASCII characters are still individually weighted at 1.0 (vs 0.25 for an
 * ASCII alphanumeric), so the BUD-13 `length/4` lower bound still holds and a
 * fully non-ASCII string still estimates at least its character count.
 */
export function estimateProviderInputTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(weighCharacters(text).weighted);
}
