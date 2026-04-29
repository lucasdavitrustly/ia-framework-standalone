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

describe('CodeChunk type — hierarchy fields', () => {
  it('accepts CodeChunk with superclass field as string', () => {
    const chunk: CodeChunk = {
      id: 'hier-1',
      filePath: '/tmp/service.ts',
      relativePath: 'service.ts',
      language: 'typescript',
      chunkType: 'class',
      name: 'PaymentService',
      content: 'class PaymentService extends BaseService {}',
      startLine: 1,
      endLine: 1,
      imports: [],
      exports: ['PaymentService'],
      superclass: 'BaseService',
    };
    expect(chunk.superclass).toBe('BaseService');
  });

  it('accepts CodeChunk with interfaces field as string[]', () => {
    const chunk: CodeChunk = {
      id: 'hier-2',
      filePath: '/tmp/service.ts',
      relativePath: 'service.ts',
      language: 'typescript',
      chunkType: 'class',
      name: 'OrderService',
      content: 'class OrderService implements Serializable, Auditable {}',
      startLine: 1,
      endLine: 1,
      imports: [],
      exports: ['OrderService'],
      interfaces: ['Serializable', 'Auditable'],
    };
    expect(chunk.interfaces).toEqual(['Serializable', 'Auditable']);
  });

  it('accepts CodeChunk with isInnerClass=true', () => {
    const chunk: CodeChunk = {
      id: 'hier-3',
      filePath: '/tmp/service.ts',
      relativePath: 'service.ts',
      language: 'typescript',
      chunkType: 'class',
      name: 'Inner',
      content: 'class Inner {}',
      startLine: 5,
      endLine: 7,
      imports: [],
      exports: [],
      isInnerClass: true,
      parentName: 'Outer',
    };
    expect(chunk.isInnerClass).toBe(true);
  });

  it('all hierarchy fields are optional (existing chunks remain valid)', () => {
    const chunk: CodeChunk = {
      id: 'hier-4',
      filePath: '/tmp/service.ts',
      relativePath: 'service.ts',
      language: 'typescript',
      chunkType: 'class',
      name: 'SimpleClass',
      content: 'class SimpleClass {}',
      startLine: 1,
      endLine: 1,
      imports: [],
      exports: ['SimpleClass'],
    };
    expect(chunk.superclass).toBeUndefined();
    expect(chunk.interfaces).toBeUndefined();
    expect(chunk.isInnerClass).toBeUndefined();
  });
});
