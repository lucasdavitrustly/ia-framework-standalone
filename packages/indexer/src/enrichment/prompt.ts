/**
 * T026: Enrichment prompt template
 *
 * Builds the structured prompt sent to Ollama for LLM enrichment.
 * Format: file-level context with chunk boundaries marked.
 * Response format: structured JSON with description/businessContext/semanticTags/relationships.
 */

// ── Prompt types ──────────────────────────────────────────────────────────────

export interface ChunkForPrompt {
  id: string;
  name?: string | undefined;
  language: string;
  chunkType: string;
  content: string;
  imports?: string[] | undefined;
  annotations?: string[] | undefined;
  /** T121: Structured annotation metadata for thin-class enrichment */
  annotationMeta?:
    | {
        operationSummaries?: string[] | undefined;
        endpointPaths?: string[] | undefined;
        httpMethods?: string[] | undefined;
        tagName?: string | undefined;
      }
    | undefined;
}

export interface EnrichedChunkResponse {
  id?: string;
  description: string;
  businessContext: string;
  semanticTags: string[];
  relationships: Array<{
    target: string;
    type: 'uses' | 'implements' | 'extends' | 'configures' | 'produces' | 'consumes' | 'tests';
    label?: string | undefined;
  }>;
}

/** @deprecated Use EnrichedChunkResponse[] directly */
export interface PromptResponse {
  chunks: EnrichedChunkResponse[];
}

// ── JSON schema for structured output ────────────────────────────────────────

export const ENRICHMENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    chunks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'description', 'businessContext', 'semanticTags', 'relationships'],
        properties: {
          id: { type: 'string' },
          description: {
            type: 'string',
            description: 'One sentence summary of what this chunk does',
          },
          businessContext: { type: 'string', description: 'Business domain this belongs to' },
          semanticTags: {
            type: 'array',
            items: { type: 'string' },
            description: '3-7 lowercase tags like ["retry","payment","resilience"]',
          },
          relationships: {
            type: 'array',
            items: {
              type: 'object',
              required: ['target', 'type'],
              properties: {
                target: { type: 'string' },
                type: {
                  type: 'string',
                  enum: [
                    'uses',
                    'implements',
                    'extends',
                    'configures',
                    'produces',
                    'consumes',
                    'tests',
                  ],
                },
                label: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
  required: ['chunks'],
} as const;

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Build a lean enrichment prompt for a batch of chunks.
 * Uses compact delimiters and minimal instructions (~60 tokens overhead).
 * Response format: flat JSON array (positional, no IDs).
 */
export function buildEnrichmentPrompt(chunks: ChunkForPrompt[], filePath: string): string {
  const chunkBlocks = chunks
    .map((chunk, index) => {
      const meta: string[] = [];
      if (chunk.annotations && chunk.annotations.length > 0) {
        meta.push(`@${chunk.annotations.join(', @')}`);
      }
      if (chunk.imports && chunk.imports.length > 0) {
        meta.push(
          `imports: ${chunk.imports.slice(0, 5).join(', ')}${chunk.imports.length > 5 ? '...' : ''}`,
        );
      }
      if (chunk.annotationMeta) {
        const m = chunk.annotationMeta;
        if (m.tagName) {
          meta.push(`tag: ${m.tagName}`);
        }
        if (m.endpointPaths && m.endpointPaths.length > 0) {
          meta.push(`endpoints: ${m.endpointPaths.join(', ')}`);
        }
        if (m.httpMethods && m.httpMethods.length > 0) {
          meta.push(`HTTP: ${m.httpMethods.join(', ')}`);
        }
        if (m.operationSummaries && m.operationSummaries.length > 0) {
          meta.push(`ops: ${m.operationSummaries.join('; ')}`);
        }
      }
      const metaLine = meta.length > 0 ? `\n${meta.join(' | ')}` : '';
      return `--- ${index + 1}: ${chunk.name ?? '(unnamed)'} (${chunk.chunkType}) ---${metaLine}\n${chunk.content}`;
    })
    .join('\n\n');

  return `Enrich these ${chunks[0]?.language ?? 'code'} chunks from "${filePath}". Return JSON array, one object per chunk in order.
Format: [{"description":"<1 sentence>","businessContext":"<domain>","semanticTags":["<3-7 lowercase>"],"relationships":[{"target":"<file>","type":"uses|implements|extends|configures|produces|consumes|tests"}]}]

${chunkBlocks}`;
}

/**
 * Parse the Ollama response into structured enrichment data.
 * Supports: flat array, legacy {chunks: [...]}, and single-object fallback.
 * Returns null if the response cannot be parsed.
 */
export function parseEnrichmentResponse(rawResponse: string): EnrichedChunkResponse[] | null {
  try {
    // Strip <think>...</think> blocks (Ollama chain-of-thought safety net)
    const cleaned = rawResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    // Strip markdown code fences if present (safety net for models that ignore format:'json')
    const stripped = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const parsed = JSON.parse(stripped);

    // New format: flat array
    if (Array.isArray(parsed)) {
      return parsed as EnrichedChunkResponse[];
    }

    // Legacy format: { chunks: [...] }
    if (parsed && Array.isArray(parsed.chunks)) {
      return parsed.chunks as EnrichedChunkResponse[];
    }

    // Single-object fallback: model returned one enrichment object instead of array
    if (parsed && typeof parsed === 'object' && 'description' in parsed) {
      return [parsed as EnrichedChunkResponse];
    }

    return null;
  } catch {
    return null;
  }
}
