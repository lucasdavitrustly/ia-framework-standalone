import { describe, it, expect } from 'vitest';
import { classify } from './classifier.js';
import type { CodeChunk } from './types.js';

/**
 * T013: Stereotype classifier tests
 * Tests MUST fail until the classifier is implemented.
 */

function makeChunk(overrides: Partial<CodeChunk>): CodeChunk {
  return {
    id: 'test-id',
    filePath: '/repo/src/PaymentService.java',
    relativePath: 'src/PaymentService.java',
    language: 'java',
    chunkType: 'class',
    name: 'PaymentService',
    content: '',
    startLine: 1,
    endLine: 50,
    imports: [],
    exports: [],
    ...overrides,
  };
}

describe('classify', () => {
  it('classifies @Service annotated class as stereotype=service, archLayer=service', () => {
    const chunk = makeChunk({
      annotations: ['@Service'],
      name: 'PaymentService',
    });
    const result = classify(chunk);
    expect(result.stereotype).toBe('service');
    expect(result.archLayer).toBe('service');
  });

  it('classifies @RestController as stereotype=controller, archLayer=presentation', () => {
    const chunk = makeChunk({
      annotations: ['@RestController'],
      name: 'PaymentController',
    });
    const result = classify(chunk);
    expect(result.stereotype).toBe('controller');
    expect(result.archLayer).toBe('presentation');
  });

  it('classifies @Repository as stereotype=repository, archLayer=persistence', () => {
    const chunk = makeChunk({
      annotations: ['@Repository'],
      name: 'PaymentRepository',
    });
    const result = classify(chunk);
    expect(result.stereotype).toBe('repository');
    expect(result.archLayer).toBe('persistence');
  });

  it('classifies @Entity as stereotype=entity, archLayer=domain', () => {
    const chunk = makeChunk({
      annotations: ['@Entity'],
      name: 'Payment',
    });
    const result = classify(chunk);
    expect(result.stereotype).toBe('entity');
    expect(result.archLayer).toBe('domain');
  });

  it('classifies @Aspect annotated class as stereotype=aspect, archLayer=crosscutting', () => {
    const chunk = makeChunk({
      annotations: ['@Aspect'],
      name: 'LoggingAspect',
    });
    const result = classify(chunk);
    expect(result.stereotype).toBe('aspect');
    expect(result.archLayer).toBe('crosscutting');
  });

  it('classifies class with "Service" suffix and no annotations as stereotype=service', () => {
    const chunk = makeChunk({
      annotations: [],
      name: 'PaymentService',
    });
    const result = classify(chunk);
    expect(result.stereotype).toBe('service');
  });

  it('classifies class with "Repository" suffix as stereotype=repository', () => {
    const chunk = makeChunk({
      annotations: [],
      name: 'PaymentRepository',
    });
    const result = classify(chunk);
    expect(result.stereotype).toBe('repository');
  });

  it('classifies @Component without further hints as stereotype=service', () => {
    const chunk = makeChunk({
      annotations: ['@Component'],
      name: 'GenericComponent',
    });
    const result = classify(chunk);
    // @Component without other annotations → generic service
    expect(['service', 'unknown']).toContain(result.stereotype);
  });

  it('returns stereotype=unknown for unrecognized classes', () => {
    const chunk = makeChunk({
      annotations: [],
      name: 'SomethingRandom',
    });
    const result = classify(chunk);
    expect(result.stereotype).toBe('unknown');
  });

  it('classifies @FeignClient as stereotype=client, archLayer=infrastructure', () => {
    const chunk = makeChunk({
      annotations: ['@FeignClient'],
      name: 'PaymentGatewayClient',
    });
    const result = classify(chunk);
    expect(result.stereotype).toBe('client');
    expect(result.archLayer).toBe('infrastructure');
  });
});
