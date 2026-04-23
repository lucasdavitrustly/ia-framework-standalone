import { describe, it, expect } from 'vitest';
import { scoreChunkSummary } from './quality-scorer.js';

describe('scoreChunkSummary', () => {
  it('returns score 0 for empty string', () => {
    const result = scoreChunkSummary('');
    expect(result.score).toBe(0);
    expect(result.checks.lengthScore).toBe(0);
    expect(result.checks.codeTokenScore).toBe(0);
    expect(result.checks.purposeVerbScore).toBe(0);
    expect(result.checks.syntaxPenalty).toBe(0);
  });

  it('returns score <= 20 for very short string', () => {
    const result = scoreChunkSummary('x');
    expect(result.score).toBeLessThanOrEqual(20);
  });

  it('returns score >= 70 for good summary with purpose verb and no code tokens', () => {
    const result = scoreChunkSummary('Handles order lifecycle including creation validation');
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('returns score <= 30 for summary with only raw code tokens', () => {
    const result = scoreChunkSummary('processOrder validateInput');
    expect(result.score).toBeLessThanOrEqual(30);
  });

  it('returns score <= 50 for syntax description pattern (takes and returns)', () => {
    const result = scoreChunkSummary('This function takes a string and returns a boolean');
    expect(result.score).toBeLessThanOrEqual(50);
  });

  it('returns score >= 80 for excellent summary with domain terms and purpose verbs', () => {
    const result = scoreChunkSummary(
      'Orchestrates the authentication flow by validating credentials against the user store and issuing JWT tokens for session management',
    );
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('score is in range 0-100', () => {
    const cases = [
      '',
      'x',
      'processOrder',
      'Handles order lifecycle',
      'This function takes a string and returns a boolean',
      'Orchestrates authentication flow and manages token lifecycle',
    ];
    for (const s of cases) {
      const { score } = scoreChunkSummary(s);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('exposes breakdown in checks property', () => {
    const result = scoreChunkSummary('Handles order creation and validates input fields');
    expect(result.checks).toHaveProperty('lengthScore');
    expect(result.checks).toHaveProperty('codeTokenScore');
    expect(result.checks).toHaveProperty('purposeVerbScore');
    expect(result.checks).toHaveProperty('syntaxPenalty');
    expect(result.score).toBe(
      result.checks.lengthScore +
        result.checks.codeTokenScore +
        result.checks.purposeVerbScore +
        result.checks.syntaxPenalty,
    );
  });

  it('penalizes camelCase identifiers in summary', () => {
    const withCode = scoreChunkSummary('processOrder validateInput');
    const withoutCode = scoreChunkSummary(
      'processes order and validates user input in the pipeline',
    );
    expect(withoutCode.score).toBeGreaterThan(withCode.score);
  });

  it('rewards multiple purpose verbs', () => {
    const oneVerb = scoreChunkSummary('Handles the request routing for incoming messages');
    const twoVerbs = scoreChunkSummary('Handles the request routing and manages session state');
    expect(twoVerbs.checks.purposeVerbScore).toBeGreaterThanOrEqual(
      oneVerb.checks.purposeVerbScore,
    );
  });

  it('penalizes syntax description with accepts parameter pattern', () => {
    const result = scoreChunkSummary('Accepts a userId parameter and returns the profile data');
    expect(result.checks.syntaxPenalty).toBeLessThanOrEqual(10);
  });
});
