import { describe, it, expect } from 'vitest';
import { getTemplate, TEMPLATES } from '../registry.js';
import type { IntentType } from '../intent-detector.js';

describe('Template Registry', () => {
  describe('getTemplate', () => {
    it('returns impact-analysis template containing key phrases', () => {
      const template = getTemplate('impact-analysis');
      expect(template).toBeDefined();
      expect(template).toContain('dependency order');
      expect(template).toContain('Estimate effort');
    });

    it('returns dependency-trace template containing key phrases', () => {
      const template = getTemplate('dependency-trace');
      expect(template).toBeDefined();
      expect(template).toContain('dependency');
      expect(template).toContain('chain');
    });

    it('returns undefined for null intent', () => {
      expect(getTemplate(null)).toBeUndefined();
    });

    it('returns undefined for unknown intent', () => {
      // An out-of-taxonomy intent can only reach getTemplate at runtime, so the
      // string is widened through `IntentType` rather than `any`.
      expect(getTemplate('unknown-intent' as IntentType)).toBeUndefined();
    });
  });

  describe('TEMPLATES map', () => {
    it('has exactly 2 entries', () => {
      expect(TEMPLATES.size).toBe(2);
    });

    it('contains impact-analysis and dependency-trace keys', () => {
      expect(TEMPLATES.has('impact-analysis')).toBe(true);
      expect(TEMPLATES.has('dependency-trace')).toBe(true);
    });
  });
});
