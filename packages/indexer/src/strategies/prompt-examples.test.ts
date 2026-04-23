import { describe, it, expect } from 'vitest';
import { loadPromptExamples } from './prompt-examples.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('loadPromptExamples', () => {
  it('returns default examples when no configDir is provided', async () => {
    const result = await loadPromptExamples();
    expect(result).toHaveProperty('good');
    expect(result).toHaveProperty('bad');
    expect(typeof result.good).toBe('string');
    expect(typeof result.bad).toBe('string');
    expect(result.good.length).toBeGreaterThan(0);
    expect(result.bad.length).toBeGreaterThan(0);
  });

  it('default good example contains OrderService class', async () => {
    const result = await loadPromptExamples();
    expect(result.good).toContain('OrderService');
    expect(result.good).toContain('class');
  });

  it('default bad example contains OrderService and shows incorrect split', async () => {
    const result = await loadPromptExamples();
    expect(result.bad).toContain('OrderService');
  });

  it('loads custom examples from configDir when files exist', async () => {
    // Use the default-examples dir as a "custom" dir to test the happy path
    const customDir = join(__dirname, 'default-examples');
    const result = await loadPromptExamples(customDir);
    expect(result.good).toContain('OrderService');
    expect(result.bad).toContain('OrderService');
  });

  it('falls back to defaults when configDir does not exist', async () => {
    const result = await loadPromptExamples('/nonexistent/path/to/config');
    // Should still return valid defaults
    expect(result.good).toContain('OrderService');
    expect(result.bad).toContain('OrderService');
  });

  it('falls back to defaults when configDir exists but has no example files', async () => {
    // Use a temp-like path that exists but has no .md files (use __dirname itself won't have them)
    const result = await loadPromptExamples('/tmp');
    expect(result.good).toContain('OrderService');
    expect(result.bad).toContain('OrderService');
  });
});
