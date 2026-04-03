import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadCorpus, scaffoldExampleCorpus, CorpusNotFoundError } from './corpus.js';
import type { BenchmarkQuery } from './types.js';
import { ZodError } from 'zod';

describe('QueryCorpus', () => {
  let tmpDir: string;
  let corpusPath: string;

  beforeEach(() => {
    tmpDir = tmpdir();
    corpusPath = join(tmpDir, `test-corpus-${Date.now()}.json`);
  });

  afterEach(async () => {
    // Clean up temp files
    try {
      await unlink(corpusPath);
    } catch {
      // File may not exist — ignore
    }
  });

  it('Test 1: loadCorpus() with valid JSON file returns array of BenchmarkQuery objects', async () => {
    const data = {
      queries: [
        {
          id: 'auth',
          query: 'authentication middleware',
          expectedFiles: ['src/middleware/auth.ts'],
          description: 'Auth middleware test',
        },
      ],
    };
    await writeFile(corpusPath, JSON.stringify(data), 'utf-8');

    const queries = await loadCorpus(corpusPath);

    expect(queries).toHaveLength(1);
    const q = queries[0] as BenchmarkQuery;
    expect(q.id).toBe('auth');
    expect(q.query).toBe('authentication middleware');
    expect(q.expectedFiles).toEqual(['src/middleware/auth.ts']);
    expect(q.description).toBe('Auth middleware test');
  });

  it('Test 2: loadCorpus() with missing file throws CorpusNotFoundError', async () => {
    const missingPath = join(tmpDir, 'does-not-exist.json');

    await expect(loadCorpus(missingPath)).rejects.toThrow(CorpusNotFoundError);
    await expect(loadCorpus(missingPath)).rejects.toMatchObject({
      name: 'CorpusNotFoundError',
      filePath: missingPath,
    });
  });

  it('Test 3: loadCorpus() with invalid JSON (missing required field) throws ZodError', async () => {
    const invalidData = {
      queries: [
        {
          id: 'auth',
          // Missing 'query' field (required)
          expectedFiles: ['src/middleware/auth.ts'],
        },
      ],
    };
    await writeFile(corpusPath, JSON.stringify(invalidData), 'utf-8');

    await expect(loadCorpus(corpusPath)).rejects.toThrow(ZodError);
  });

  it('Test 4: loadCorpus() with empty queries array returns []', async () => {
    const data = { queries: [] };
    await writeFile(corpusPath, JSON.stringify(data), 'utf-8');

    const queries = await loadCorpus(corpusPath);

    expect(queries).toEqual([]);
  });

  it('Test 5: scaffoldExampleCorpus() writes valid benchmark-queries.json; subsequent loadCorpus() parses it', async () => {
    await scaffoldExampleCorpus(corpusPath);

    const content = await readFile(corpusPath, 'utf-8');
    const parsed = JSON.parse(content) as unknown;

    // Should be valid JSON with queries array
    expect(parsed).toHaveProperty('queries');

    const queries = await loadCorpus(corpusPath);
    expect(Array.isArray(queries)).toBe(true);
    expect(queries.length).toBeGreaterThan(0);
  });

  it('Test 6: scaffoldExampleCorpus() does NOT overwrite existing file', async () => {
    const originalContent = JSON.stringify({ queries: [{ id: 'original', query: 'original query', expectedFiles: ['original.ts'] }] });
    await writeFile(corpusPath, originalContent, 'utf-8');

    // Should throw or no-op (wx flag = fail if exists)
    await expect(scaffoldExampleCorpus(corpusPath)).rejects.toThrow();

    // Original content should be unchanged
    const content = await readFile(corpusPath, 'utf-8');
    expect(content).toBe(originalContent);
  });
});
