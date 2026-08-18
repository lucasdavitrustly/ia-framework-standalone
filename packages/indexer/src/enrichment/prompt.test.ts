import { describe, it, expect } from 'vitest';
import { buildEnrichmentPrompt, buildEnrichmentSchema, type ChunkForPrompt } from './prompt.js';

// ── T115: Enrichment prompt includes annotationMeta for controller stereotypes ──

describe('buildEnrichmentPrompt - annotationMeta inclusion (T115)', () => {
  it('includes annotationMeta operation summaries and endpoint paths in prompt output', () => {
    const chunks: (ChunkForPrompt & {
      annotationMeta?: {
        operationSummaries?: string[];
        endpointPaths?: string[];
        httpMethods?: string[];
        tagName?: string;
      };
    })[] = [
      {
        id: 'chunk-entry-sig',
        name: 'EntryController',
        language: 'java',
        chunkType: 'class-signature',
        content: '@RestController\npublic class EntryController { ... }',
        annotations: ['@RestController', '@RequestMapping("v1/entries")'],
        annotationMeta: {
          operationSummaries: ['Create an entry', 'Get an entry by ID'],
          endpointPaths: ['v1/entries', '/{id}'],
          httpMethods: ['GET', 'POST'],
          tagName: 'Entries',
        },
      },
    ];

    const prompt = buildEnrichmentPrompt(chunks, 'src/EntryController.java');

    // The prompt should contain the annotation metadata to help the LLM understand the controller
    expect(prompt).toContain('EntryController');
    expect(prompt).toContain('@RestController');

    // When annotationMeta is present, the prompt should include structured API context
    // This test verifies the enhanced prompt includes annotationMeta signals
    expect(prompt).toContain('Create an entry');
    expect(prompt).toContain('Get an entry by ID');
    expect(prompt).toContain('v1/entries');
    expect(prompt).toContain('Entries');
  });

  it('does not include annotationMeta section when no annotationMeta is present', () => {
    const chunks: ChunkForPrompt[] = [
      {
        id: 'chunk-service',
        name: 'PaymentService',
        language: 'java',
        chunkType: 'class-signature',
        content: '@Service\npublic class PaymentService { ... }',
        annotations: ['@Service'],
      },
    ];

    const prompt = buildEnrichmentPrompt(chunks, 'src/PaymentService.java');

    // Should still build a valid prompt without annotation meta sections
    expect(prompt).toContain('PaymentService');
    expect(prompt).toContain('@Service');
    // Should not contain annotation meta markers
    expect(prompt).not.toContain('API endpoints:');
    expect(prompt).not.toContain('operationSummaries');
  });
});

// ── D-011: bounded output schema & short relationship targets ──────────────────

describe('buildEnrichmentSchema - output bounds (D-011)', () => {
  it('bounds the array to exactly the chunk count', () => {
    const schema = buildEnrichmentSchema(7) as { minItems: number; maxItems: number };
    expect(schema.minItems).toBe(7);
    expect(schema.maxItems).toBe(7);
  });

  it('bounds relationships and target length to prevent output-token runaway', () => {
    const schema = buildEnrichmentSchema(3) as {
      items: {
        properties: {
          relationships: { maxItems: number; items: { properties: { target: { maxLength: number } } } };
          semanticTags: { maxItems: number };
        };
      };
    };
    const props = schema.items.properties;
    expect(props.relationships.maxItems).toBe(3);
    expect(props.relationships.items.properties.target.maxLength).toBe(80);
    expect(props.semanticTags.maxItems).toBe(5);
  });
});

describe('buildEnrichmentPrompt - relationship target hint (D-011)', () => {
  it('asks for a filename-only target, not an absolute path', () => {
    const chunks: ChunkForPrompt[] = [
      {
        id: 'c1',
        name: 'AbstractProcessHandler',
        language: 'java',
        chunkType: 'class-signature',
        content: 'abstract class AbstractProcessHandler {}',
      },
    ];
    const prompt = buildEnrichmentPrompt(chunks, 'achpro-services/src/.../AbstractProcessHandler.java');
    expect(prompt).toContain('filename only');
    // The lean format hint must not advertise a bare "<file>" target anymore.
    expect(prompt).not.toContain('"target":"<file>"');
  });
});
