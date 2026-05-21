import { describe, it, expect } from 'vitest';
import { classifyBudget, DEFAULT_BUDGET_CONFIG, type BudgetConfig } from '../adaptive-budget.js';

describe('classifyBudget', () => {
  describe('complex patterns', () => {
    it('classifies impact/modification queries as complex', () => {
      const result = classifyBudget(
        'If want to add new payment-processor in the ACH, what would I need to modify?',
      );
      expect(result.complexity).toBe('complex');
      expect(result.tokenBudget).toBe(DEFAULT_BUDGET_CONFIG.complex);
    });

    it('classifies architecture queries as complex', () => {
      const result = classifyBudget('What is the overall architecture of this project?');
      expect(result.complexity).toBe('complex');
      expect(result.tokenBudget).toBe(DEFAULT_BUDGET_CONFIG.complex);
    });

    it('classifies cross-module interaction queries as complex', () => {
      const result = classifyBudget('How do modules X and Y interact with each other?');
      expect(result.complexity).toBe('complex');
      expect(result.tokenBudget).toBe(DEFAULT_BUDGET_CONFIG.complex);
    });

    it('classifies pattern-finding queries as complex', () => {
      const result = classifyBudget(
        'What error handling patterns are used in this project? Are there any inconsistencies?',
      );
      expect(result.complexity).toBe('complex');
      expect(result.tokenBudget).toBe(DEFAULT_BUDGET_CONFIG.complex);
    });

    it('classifies "what would break" queries as complex', () => {
      const result = classifyBudget('What would break if we changed the entry status enum?');
      expect(result.complexity).toBe('complex');
    });
  });

  describe('simple patterns', () => {
    it('classifies existence checks as simple', () => {
      const result = classifyBudget('Does this project use WebSocket connections?');
      expect(result.complexity).toBe('simple');
      expect(result.tokenBudget).toBe(DEFAULT_BUDGET_CONFIG.simple);
    });

    it('classifies "where is" lookups as simple', () => {
      const result = classifyBudget('Where is createUser defined?');
      expect(result.complexity).toBe('simple');
      expect(result.tokenBudget).toBe(DEFAULT_BUDGET_CONFIG.simple);
    });

    it('classifies "find the" lookups as simple', () => {
      const result = classifyBudget('Find the EntryRepository interface');
      expect(result.complexity).toBe('simple');
      expect(result.tokenBudget).toBe(DEFAULT_BUDGET_CONFIG.simple);
    });

    it('classifies "what is X" as simple', () => {
      const result = classifyBudget('What is EntryCore?');
      expect(result.complexity).toBe('simple');
      expect(result.tokenBudget).toBe(DEFAULT_BUDGET_CONFIG.simple);
    });
  });

  describe('word count heuristic', () => {
    it('classifies very short queries as simple', () => {
      const result = classifyBudget('entry status');
      expect(result.complexity).toBe('simple');
      expect(result.reason).toBe('short-query');
    });

    it('classifies medium-length queries as moderate', () => {
      const result = classifyBudget('How is an entry persisted in the database?');
      expect(result.complexity).toBe('moderate');
    });
  });

  describe('conjunction/compound boost', () => {
    it('boosts queries with "and" to complex', () => {
      const result = classifyBudget(
        'How is entry created and how is it submitted to the processor?',
      );
      expect(result.complexity).toBe('complex');
    });

    it('boosts queries with multiple question marks', () => {
      const result = classifyBudget('How does entry work? What about settlements?');
      expect(result.complexity).toBe('complex');
    });
  });

  describe('custom config', () => {
    it('uses custom budget values', () => {
      const config: BudgetConfig = { simple: 4000, moderate: 12000, complex: 24000 };
      const result = classifyBudget('Does this project use Redis?', config);
      expect(result.complexity).toBe('simple');
      expect(result.tokenBudget).toBe(4000);
    });
  });

  describe('edge cases', () => {
    it('returns moderate for empty query', () => {
      const result = classifyBudget('');
      expect(result.complexity).toBe('moderate');
      expect(result.reason).toBe('empty-query-default');
    });

    it('returns moderate for whitespace-only query', () => {
      const result = classifyBudget('   ');
      expect(result.complexity).toBe('moderate');
    });
  });
});
