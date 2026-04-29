import { describe, it, expect } from 'vitest';
import { detectIntent } from '../intent-detector.js';

describe('detectIntent', () => {
  describe('impact-analysis queries', () => {
    it.each([
      ['what files need updating if I change the User model', 'impact-analysis'],
      ['what changes are needed', 'impact-analysis'],
      ['impact of removing this function', 'impact-analysis'],
      ['affects which modules', 'impact-analysis'],
      ['if I change the database schema', 'impact-analysis'],
      ['need to update after renaming', 'impact-analysis'],
      ['breaking change', 'impact-analysis'],
      ['files need updating when we modify the API', 'impact-analysis'],
    ])('detectIntent("%s") → "%s"', (query, expected) => {
      expect(detectIntent(query)).toBe(expected);
    });
  });

  describe('dependency-trace queries', () => {
    it.each([
      ['depends on which modules', 'dependency-trace'],
      ['dependency chain for auth', 'dependency-trace'],
      ['what uses this function', 'dependency-trace'],
      ['callers of handleRequest', 'dependency-trace'],
    ])('detectIntent("%s") → "%s"', (query, expected) => {
      expect(detectIntent(query)).toBe(expected);
    });
  });

  describe('no match', () => {
    it('returns null for general queries', () => {
      expect(detectIntent('how does authentication work')).toBeNull();
    });

    it('returns null for find queries', () => {
      expect(detectIntent('find the User class')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(detectIntent('')).toBeNull();
    });
  });

  describe('case insensitivity', () => {
    it('handles uppercase input', () => {
      expect(detectIntent('WHAT FILES need updating')).toBe('impact-analysis');
    });

    it('handles mixed case', () => {
      expect(detectIntent('Dependency Chain for auth')).toBe('dependency-trace');
    });
  });
});
