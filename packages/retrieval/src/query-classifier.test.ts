import { describe, it, expect } from 'vitest';
import { classifyQuery, detectTestIntent, QueryType } from './query-classifier.js';

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

// T128: Test intent detection
describe('detectTestIntent', () => {
  describe('queries with test intent', () => {
    it('detects "tests for EntryService" as test intent', () => {
      expect(detectTestIntent('tests for EntryService')).toBe(true);
    });

    it('detects "unit test for payment processing" as test intent', () => {
      expect(detectTestIntent('unit test for payment processing')).toBe(true);
    });

    it('detects "how is EntryService tested" as test intent', () => {
      expect(detectTestIntent('how is EntryService tested')).toBe(true);
    });

    it('detects "test cases for retry logic" as test intent', () => {
      expect(detectTestIntent('test cases for retry logic')).toBe(true);
    });

    it('detects "spec for PaymentController" as test intent', () => {
      expect(detectTestIntent('spec for PaymentController')).toBe(true);
    });

    it('detects "test coverage for module" as test intent', () => {
      expect(detectTestIntent('test coverage for module')).toBe(true);
    });

    it('detects "find test helpers for entry" as test intent', () => {
      expect(detectTestIntent('find test helpers for entry')).toBe(true);
    });

    it('detects "mock implementation of gateway" as test intent', () => {
      expect(detectTestIntent('mock implementation of gateway')).toBe(true);
    });
  });

  describe('queries without test intent', () => {
    it('does NOT detect "how is Entry created" as test intent', () => {
      expect(detectTestIntent('how is Entry created')).toBe(false);
    });

    it('does NOT detect "payment retry logic" as test intent', () => {
      expect(detectTestIntent('payment retry logic')).toBe(false);
    });

    it('does NOT detect "EntryService.createEntry" as test intent', () => {
      expect(detectTestIntent('EntryService.createEntry')).toBe(false);
    });

    it('does NOT detect "where is the latest version" as test intent', () => {
      expect(detectTestIntent('where is the latest version')).toBe(false);
    });

    it('does NOT detect "attestation service" as test intent (contains "test" substring)', () => {
      expect(detectTestIntent('attestation service')).toBe(false);
    });

    it('does NOT detect "contest results handler" as test intent (contains "test" substring)', () => {
      expect(detectTestIntent('contest results handler')).toBe(false);
    });
  });
});
