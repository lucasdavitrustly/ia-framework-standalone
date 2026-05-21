import { describe, it, expect } from 'vitest';
import { extractSymbols } from '../symbol-extractor.js';
import type { RetrievalResult } from '../types.js';

function makeResult(content: string, name?: string): RetrievalResult {
  return {
    chunkId: 'chunk-' + Math.random().toString(36).slice(2, 8),
    filePath: '/src/test.java',
    relativePath: 'src/test.java',
    language: 'java',
    chunkType: 'class',
    name,
    content,
    startLine: 1,
    endLine: 10,
    imports: [],
    exports: [],
    score: 0.8,
    matchedVector: 'text',
  };
}

describe('extractSymbols', () => {
  it('extracts class references from new expressions', () => {
    const results = [makeResult('PaymentService svc = new PaymentGateway();')];
    const symbols = extractSymbols(results);
    expect(symbols.classReferences).toContain('PaymentGateway');
  });

  it('extracts class references from type annotations', () => {
    const results = [makeResult('private final TransactionRepository repo;')];
    const symbols = extractSymbols(results);
    expect(symbols.classReferences).toContain('TransactionRepository');
  });

  it('extracts method calls', () => {
    const results = [makeResult('gateway.processPayment(amount);')];
    const symbols = extractSymbols(results);
    expect(symbols.methodCalls).toContain('processPayment');
  });

  it('filters out noise classes like String, List', () => {
    const results = [makeResult('String name = new String("test"); List<Item> items;')];
    const symbols = extractSymbols(results);
    expect(symbols.classReferences).not.toContain('String');
    expect(symbols.classReferences).not.toContain('List');
  });

  it('filters out noise methods like get, set, toString', () => {
    const results = [makeResult('obj.get(); obj.set(x); obj.toString();')];
    const symbols = extractSymbols(results);
    expect(symbols.methodCalls).not.toContain('get');
    expect(symbols.methodCalls).not.toContain('set');
    expect(symbols.methodCalls).not.toContain('toString');
  });

  it('excludes symbols already in result names', () => {
    const results = [makeResult('PaymentService svc = new PaymentGateway();', 'PaymentService')];
    const symbols = extractSymbols(results);
    expect(symbols.classReferences).not.toContain('PaymentService');
    expect(symbols.classReferences).toContain('PaymentGateway');
  });

  it('respects maxSymbols limit', () => {
    const code = Array.from({ length: 20 }, (_, i) => `new Class${i}();`).join('\n');
    const results = [makeResult(code)];
    const symbols = extractSymbols(results, 5);
    expect(symbols.classReferences.length + symbols.methodCalls.length).toBeLessThanOrEqual(5);
  });

  it('extracts from implements clause', () => {
    const results = [makeResult('public class Foo implements Serializable, Cloneable {')];
    const symbols = extractSymbols(results);
    expect(symbols.classReferences).toContain('Serializable');
    expect(symbols.classReferences).toContain('Cloneable');
  });
});
