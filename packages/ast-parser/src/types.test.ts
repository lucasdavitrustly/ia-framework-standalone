import { describe, it, expect } from 'vitest';
import type { CodeChunk } from './types.js';

describe('CodeChunk type — description and semantic chunkType', () => {
  it('accepts CodeChunk with description field', () => {
    const chunk: CodeChunk = {
      id: 'test-1',
      filePath: '/tmp/test.ts',
      relativePath: 'test.ts',
      language: 'typescript',
      chunkType: 'function',
      name: 'testFn',
      content: 'function testFn() {}',
      startLine: 1,
      endLine: 1,
      imports: [],
      exports: ['testFn'],
      description: 'A test function that does nothing',
    };
    expect(chunk.description).toBe('A test function that does nothing');
  });

  it('accepts CodeChunk with chunkType "semantic"', () => {
    const chunk: CodeChunk = {
      id: 'test-2',
      filePath: '/tmp/test.ts',
      relativePath: 'test.ts',
      language: 'typescript',
      chunkType: 'semantic',
      name: 'testChunk',
      content: 'const x = 1;',
      startLine: 1,
      endLine: 1,
      imports: [],
      exports: [],
    };
    expect(chunk.chunkType).toBe('semantic');
  });

  it('accepts CodeChunk without description (backward compatible)', () => {
    const chunk: CodeChunk = {
      id: 'test-3',
      filePath: '/tmp/test.ts',
      relativePath: 'test.ts',
      language: 'typescript',
      chunkType: 'function',
      name: 'foo',
      content: 'function foo() {}',
      startLine: 1,
      endLine: 1,
      imports: [],
      exports: ['foo'],
    };
    expect(chunk.description).toBeUndefined();
  });
});
