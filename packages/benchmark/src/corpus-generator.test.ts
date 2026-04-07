import { describe, it, expect } from 'vitest';
import { buildFewShotExamples } from './corpus-generator.js';

describe('buildFewShotExamples', () => {
  it('includes the first directory name in the output', () => {
    const grouped = new Map([
      ['payment-gateway-core', ['payment-gateway-core/src/Domain.java']],
      ['adapters', ['adapters/src/Adapter.java']],
    ]);

    const result = buildFewShotExamples(grouped);

    expect(result).toContain('payment-gateway-core');
  });

  it('includes the filename stem of the first file as a class name example', () => {
    const grouped = new Map([
      ['payment-gateway-core', ['payment-gateway-core/src/main/SettingsDefinition.java']],
    ]);

    const result = buildFewShotExamples(grouped);

    expect(result).toContain('SettingsDefinition');
    // Should not include the extension
    expect(result).not.toContain('SettingsDefinition.java');
  });

  it('uses the second directory for cross-file example when available', () => {
    const grouped = new Map([
      ['core', ['core/src/Core.ts']],
      ['adapters', ['adapters/src/Adapter.ts']],
    ]);

    const result = buildFewShotExamples(grouped);

    expect(result).toContain('core');
    expect(result).toContain('adapters');
  });

  it('falls back gracefully when only one directory with one file', () => {
    const grouped = new Map([['src', ['src/index.ts']]]);

    const result = buildFewShotExamples(grouped);

    expect(result).toContain('src');
    expect(result).toContain('index');
    expect(result).toMatch(/sem:|kw:|xf:|cx:|neg:|edge:/);
  });

  it('falls back gracefully when map is empty', () => {
    const grouped = new Map<string, string[]>();

    const result = buildFewShotExamples(grouped);

    // Should not throw and should still return a string with all 6 categories
    expect(typeof result).toBe('string');
    expect(result).toMatch(/sem:|kw:|xf:|cx:|neg:|edge:/);
  });

  it('always includes all 6 query category labels', () => {
    const grouped = new Map([
      ['packages', ['packages/core/src/index.ts', 'packages/cli/src/bin.ts']],
      ['apps', ['apps/dashboard/src/App.tsx']],
    ]);

    const result = buildFewShotExamples(grouped);

    expect(result).toContain('sem:');
    expect(result).toContain('kw:');
    expect(result).toContain('xf:');
    expect(result).toContain('cx:');
    expect(result).toContain('neg:');
    expect(result).toContain('edge:');
  });

  it('does not contain SQL SELECT or FROM keywords in the output', () => {
    const grouped = new Map([
      [
        'payment-gateway-core',
        ['payment-gateway-core/src/domain/settings/SettingsDefinition.java'],
      ],
    ]);

    const result = buildFewShotExamples(grouped);

    // Check for SQL query patterns — "SELECT" and "FROM table" are SQL-specific
    // "WHERE" alone can appear in natural language ("where is error handling...")
    expect(result).not.toMatch(/\bSELECT\b/i);
    expect(result).not.toMatch(/\bSELECT\s+\*/i);
    expect(result).not.toMatch(/FROM\s+\w+\.\w+/i); // SQL FROM table.column pattern
  });
});
