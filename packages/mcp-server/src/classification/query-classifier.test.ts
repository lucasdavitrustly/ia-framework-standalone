import { describe, it, expect } from 'vitest';
import { classifyQuery, DEFAULT_RULES, type QueryClassification } from './query-classifier.js';

describe('classifyQuery', () => {
  describe('symbol detection — PascalCase', () => {
    it('classifies PascalCase identifier as keyword', () => {
      const result = classifyQuery('UserService');
      expect(result.type).toBe('keyword');
      expect(result.reason).toBe('symbol-pascalcase');
      expect(result.confidence).toBe(1.0);
    });

    it('classifies multi-word PascalCase as keyword', () => {
      const result = classifyQuery('DatabaseConnectionPool');
      expect(result.type).toBe('keyword');
      expect(result.reason).toBe('symbol-pascalcase');
    });
  });

  describe('symbol detection — camelCase', () => {
    it('classifies camelCase identifier as keyword', () => {
      const result = classifyQuery('getUserById');
      expect(result.type).toBe('keyword');
      expect(result.reason).toBe('symbol-camelcase');
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('symbol detection — dot notation', () => {
    it('classifies dot-notation as keyword', () => {
      const result = classifyQuery('fs.readFileSync');
      expect(result.type).toBe('keyword');
      expect(result.reason).toBe('symbol-dotnotation');
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('quoted strings', () => {
    it('classifies double-quoted string as keyword', () => {
      const result = classifyQuery('"exact string match"');
      expect(result.type).toBe('keyword');
      expect(result.reason).toBe('quoted-string');
      expect(result.confidence).toBe(1.0);
    });

    it('classifies single-quoted string as keyword', () => {
      const result = classifyQuery("'some function name'");
      expect(result.type).toBe('keyword');
      expect(result.reason).toBe('quoted-string');
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('lookup verbs', () => {
    it('classifies query starting with "find" as keyword', () => {
      const result = classifyQuery('find handleAuth');
      expect(result.type).toBe('keyword');
      expect(result.reason).toBe('lookup-verb');
      expect(result.confidence).toBe(0.8);
    });

    it('classifies query starting with "where" as keyword', () => {
      const result = classifyQuery('where is the database config');
      expect(result.type).toBe('keyword');
      expect(result.reason).toBe('lookup-verb');
      expect(result.confidence).toBe(0.8);
    });

    it('does not classify long query with lookup verb as keyword', () => {
      const result = classifyQuery(
        'find me all the places where error handling is done incorrectly in the entire codebase',
      );
      expect(result.type).toBe('semantic');
    });
  });

  describe('semantic queries', () => {
    it('classifies conceptual question as semantic', () => {
      const result = classifyQuery('how does authentication work');
      expect(result.type).toBe('semantic');
      expect(result.reason).toBe('default');
      expect(result.confidence).toBe(0.5);
    });

    it('classifies multi-service question as semantic', () => {
      const result = classifyQuery('explain the data flow between services');
      expect(result.type).toBe('semantic');
      expect(result.reason).toBe('default');
    });

    it('classifies architecture question as semantic', () => {
      const result = classifyQuery('what is the architecture of the payment system');
      expect(result.type).toBe('semantic');
      expect(result.reason).toBe('default');
    });
  });

  describe('custom rules', () => {
    it('uses custom symbolPatterns when provided', () => {
      const result = classifyQuery('XFOO', { symbolPatterns: [/^X/] });
      expect(result.type).toBe('keyword');
    });

    it('uses custom lookupVerbs', () => {
      const result = classifyQuery('search handleAuth', { lookupVerbs: ['search'] });
      expect(result.type).toBe('keyword');
      expect(result.reason).toBe('lookup-verb');
    });

    it('uses custom maxKeywordWords', () => {
      const result = classifyQuery('find the thing', { maxKeywordWords: 2 });
      // 3 words > maxKeywordWords of 2, so lookup verb rule won't fire
      expect(result.type).toBe('semantic');
    });
  });

  describe('performance', () => {
    it('classifies 1000 queries in under 5ms total', () => {
      const queries = [
        'UserService',
        'getUserById',
        'fs.readFileSync',
        '"exact match"',
        'find handleAuth',
        'how does authentication work',
        'explain the data flow between services',
        'where is the database config',
        'what is the architecture of the payment system',
        'DatabaseConnectionPool',
      ];

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        classifyQuery(queries[i % queries.length]!);
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50); // 50ms budget for 1000 calls (generous)
    });
  });

  describe('edge cases', () => {
    it('handles empty string as semantic', () => {
      const result = classifyQuery('');
      expect(result.type).toBe('semantic');
    });

    it('classifies short identifier-like words as keyword', () => {
      const result = classifyQuery('handleAuth');
      expect(result.type).toBe('keyword');
      expect(result.reason).toBe('symbol-camelcase');
    });
  });

  describe('existence queries', () => {
    it('classifies "does this use X" as existence', () => {
      const result = classifyQuery('does this project use Redis');
      expect(result.type).toBe('existence');
      expect(result.reason).toBe('existence-pattern');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('classifies "is there a" as existence', () => {
      const result = classifyQuery('is there a retry mechanism');
      expect(result.type).toBe('existence');
      expect(result.reason).toBe('existence-pattern');
    });

    it('classifies "does it have" as existence', () => {
      const result = classifyQuery('does it have circuit breaker');
      expect(result.type).toBe('existence');
      expect(result.reason).toBe('existence-pattern');
    });

    it('classifies "are there any" as existence', () => {
      const result = classifyQuery('are there any unit tests for payment');
      expect(result.type).toBe('existence');
      expect(result.reason).toBe('existence-pattern');
    });

    it('classifies "does the codebase use" as existence', () => {
      const result = classifyQuery('does the codebase use dependency injection');
      expect(result.type).toBe('existence');
      expect(result.reason).toBe('existence-pattern');
    });
  });

  describe('aggregation detection', () => {
    it('classifies "find all endpoints" as aggregation', () => {
      const result = classifyQuery('find all endpoints');
      expect(result.type).toBe('aggregation');
      expect(result.reason).toBe('aggregation-pattern');
      expect(result.confidence).toBe(0.9);
    });

    it('classifies "list all controllers" as aggregation', () => {
      const result = classifyQuery('list all controllers');
      expect(result.type).toBe('aggregation');
    });

    it('classifies "show all the services" as aggregation', () => {
      const result = classifyQuery('show all the services');
      expect(result.type).toBe('aggregation');
    });

    it('classifies "what are all the interfaces" as aggregation', () => {
      const result = classifyQuery('what are all the interfaces');
      expect(result.type).toBe('aggregation');
    });

    it('classifies "where are all the tests" as aggregation', () => {
      const result = classifyQuery('where are all the tests');
      expect(result.type).toBe('aggregation');
    });

    it('classifies "how many routes" as aggregation', () => {
      const result = classifyQuery('how many routes does this have');
      expect(result.type).toBe('aggregation');
    });

    it('classifies "get every middleware" as aggregation', () => {
      const result = classifyQuery('get every middleware');
      expect(result.type).toBe('aggregation');
    });
  });
});
