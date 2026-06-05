import { describe, it, expect } from 'vitest';
import { classifyQuery, QueryType } from './query-classifier.js';

/**
 * T055: Tests for query classifier.
 *
 * The classifier determines which vectors to search based on query characteristics:
 * - 'semantic': natural language description → search semantic vector
 * - 'symbol': CamelCase.method or dotted path → search signature + sparse vectors
 * - 'keyword': single uppercase token → search sparse + semantic vectors
 * - 'mixed': combination → search all 3 vectors
 */
describe('classifyQuery', () => {
  describe('semantic queries — natural language descriptions', () => {
    it('classifies "payment retry logic" as semantic', () => {
      expect(classifyQuery('payment retry logic')).toBe('semantic' satisfies QueryType);
    });

    it('classifies "how does authentication work" as semantic', () => {
      expect(classifyQuery('how does authentication work')).toBe('semantic' satisfies QueryType);
    });

    it('classifies "find all database connection handling" as semantic', () => {
      expect(classifyQuery('find all database connection handling')).toBe(
        'semantic' satisfies QueryType,
      );
    });

    it('classifies multi-word lowercase query as semantic', () => {
      expect(classifyQuery('order processing workflow steps')).toBe('semantic' satisfies QueryType);
    });
  });

  describe('symbol queries — CamelCase or dot-notation identifiers', () => {
    it('classifies "PaymentService.processPayment" as symbol', () => {
      expect(classifyQuery('PaymentService.processPayment')).toBe('symbol' satisfies QueryType);
    });

    it('classifies "com.example.PaymentService" as symbol', () => {
      expect(classifyQuery('com.example.PaymentService')).toBe('symbol' satisfies QueryType);
    });

    it('classifies "UserRepository::findById" as symbol', () => {
      expect(classifyQuery('UserRepository::findById')).toBe('symbol' satisfies QueryType);
    });

    it('classifies "OrderController.createOrder" as symbol', () => {
      expect(classifyQuery('OrderController.createOrder')).toBe('symbol' satisfies QueryType);
    });
  });

  describe('keyword queries — single uppercase token or identifier', () => {
    it('classifies "FiGatewayClient" as keyword', () => {
      expect(classifyQuery('FiGatewayClient')).toBe('keyword' satisfies QueryType);
    });

    it('classifies "PaymentService" (single CamelCase token) as keyword', () => {
      expect(classifyQuery('PaymentService')).toBe('keyword' satisfies QueryType);
    });

    it('classifies "PAYMENT_RETRY_MAX" as keyword', () => {
      expect(classifyQuery('PAYMENT_RETRY_MAX')).toBe('keyword' satisfies QueryType);
    });
  });

  describe('mixed queries — combine natural language with identifiers', () => {
    it('classifies "how does PaymentService handle retries" as mixed', () => {
      expect(classifyQuery('how does PaymentService handle retries')).toBe(
        'mixed' satisfies QueryType,
      );
    });

    it('classifies "error handling in OrderController" as mixed', () => {
      expect(classifyQuery('error handling in OrderController')).toBe('mixed' satisfies QueryType);
    });
  });

  describe('edge cases', () => {
    it('handles empty string gracefully (returns semantic)', () => {
      expect(classifyQuery('')).toBe('semantic' satisfies QueryType);
    });

    it('handles single lowercase word as semantic', () => {
      expect(classifyQuery('payment')).toBe('semantic' satisfies QueryType);
    });
  });
});
