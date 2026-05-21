import { describe, it, expect } from 'vitest';
import {
  detectConcepts,
  generateConceptChunks,
  DEFAULT_PATTERNS,
  type EnrichedChunk,
} from './concept-generator.js';

function makeChunk(overrides: Partial<EnrichedChunk> = {}): EnrichedChunk {
  return {
    id: 'test-chunk-1',
    filePath: '/project/src/Service.java',
    relativePath: 'src/Service.java',
    language: 'java',
    chunkType: 'function',
    name: 'handleRequest',
    content: 'public void handleRequest() { }',
    startLine: 1,
    endLine: 5,
    imports: [],
    exports: [],
    ...overrides,
  };
}

describe('detectConcepts', () => {
  it('detects error-handling pattern from content', () => {
    const chunks: EnrichedChunk[] = [
      makeChunk({ id: '1', content: 'catch (Exception e) { log.error(e); }' }),
      makeChunk({ id: '2', content: 'throw new BusinessException("invalid");' }),
      makeChunk({
        id: '3',
        content: 'catch (IOException e) { throw new UnexpectedException(e); }',
      }),
    ];

    const concepts = detectConcepts(chunks);
    const errorConcept = concepts.find((c) => c.pattern.id === 'error-handling');
    expect(errorConcept).toBeDefined();
    expect(errorConcept!.chunks.length).toBe(3);
  });

  it('requires minimum 3 chunks to be cross-cutting', () => {
    const chunks: EnrichedChunk[] = [
      makeChunk({ id: '1', content: 'encrypt(data)' }),
      makeChunk({ id: '2', content: 'decrypt(data)' }),
    ];

    const concepts = detectConcepts(chunks);
    const secConcept = concepts.find((c) => c.pattern.id === 'encryption-security');
    expect(secConcept).toBeUndefined();
  });

  it('detects patterns from name matching', () => {
    const chunks: EnrichedChunk[] = [
      makeChunk({ id: '1', name: 'SecurityConfig', content: 'class SecurityConfig {}' }),
      makeChunk({ id: '2', name: 'AuthService', content: 'class AuthService {}' }),
      makeChunk({ id: '3', name: 'CryptoHelper', content: 'class CryptoHelper {}' }),
    ];

    const concepts = detectConcepts(chunks);
    const secConcept = concepts.find((c) => c.pattern.id === 'encryption-security');
    expect(secConcept).toBeDefined();
    expect(secConcept!.chunks.length).toBe(3);
  });

  it('detects patterns from layerHints', () => {
    const chunks: EnrichedChunk[] = [
      makeChunk({ id: '1', layerHints: ['repository'], content: 'class JdbcRepo {}' }),
      makeChunk({ id: '2', layerHints: ['repository'], content: 'class JdbcOther {}' }),
      makeChunk({ id: '3', layerHints: ['repository'], content: 'class JdbcThird {}' }),
    ];

    const concepts = detectConcepts(chunks);
    const persistConcept = concepts.find((c) => c.pattern.id === 'persistence-patterns');
    expect(persistConcept).toBeDefined();
  });

  it('allows custom minChunks threshold', () => {
    const chunks: EnrichedChunk[] = [
      makeChunk({ id: '1', content: 'encrypt(data)' }),
      makeChunk({ id: '2', content: 'decrypt(data)' }),
    ];

    const concepts = detectConcepts(chunks, DEFAULT_PATTERNS, 2);
    const secConcept = concepts.find((c) => c.pattern.id === 'encryption-security');
    expect(secConcept).toBeDefined();
  });
});

describe('generateConceptChunks', () => {
  it('generates aspect chunks from detected concepts', () => {
    const chunks: EnrichedChunk[] = [
      makeChunk({
        id: '1',
        filePath: '/p/A.java',
        relativePath: 'A.java',
        content: 'catch (Exception e) {}',
        name: 'handleA',
      }),
      makeChunk({
        id: '2',
        filePath: '/p/B.java',
        relativePath: 'B.java',
        content: 'throw new BusinessException("x");',
        name: 'handleB',
      }),
      makeChunk({
        id: '3',
        filePath: '/p/C.java',
        relativePath: 'C.java',
        content: 'catch (IOException e) {}',
        name: 'handleC',
      }),
    ];

    const concepts = detectConcepts(chunks);
    const generated = generateConceptChunks(concepts, '/project');

    expect(generated.length).toBeGreaterThan(0);
    const first = generated[0]!;
    expect(first.chunk.chunkType).toBe('aspect');
    expect(first.chunk.name).toContain('concept:');
    expect(first.chunk.content).toContain('Cross-cutting concept');
    expect(first.chunk.content).toContain('A.java');
    expect(first.sourceCount).toBe(3);
  });

  it('generates chunks with valid CodeChunk structure', () => {
    const chunks: EnrichedChunk[] = [
      makeChunk({ id: '1', content: '@Transactional public void save() {}' }),
      makeChunk({ id: '2', content: 'INSERT INTO achpro.entries VALUES (...)' }),
      makeChunk({ id: '3', content: 'JdbcTemplate.update("UPDATE entries SET ...")' }),
    ];

    const concepts = detectConcepts(chunks);
    const generated = generateConceptChunks(concepts, '/project');

    for (const g of generated) {
      expect(g.chunk.id).toBeDefined();
      expect(g.chunk.filePath).toContain('.concepts/');
      expect(g.chunk.imports).toEqual([]);
      expect(g.chunk.exports).toEqual([]);
      expect(g.chunk.startLine).toBe(1);
    }
  });
});
