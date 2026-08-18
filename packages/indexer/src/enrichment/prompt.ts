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

/**
 * Build a bounded JSON schema for Ollama's `format` option enforcing a
 * top-level array of exactly `count` enrichment objects (one per batched chunk).
 *
 * The `minItems`/`maxItems` bounds are load-bearing: without them small models
 * (e.g. qwen2.5-coder) collapse a multi-chunk batch into a single object or
 * ramble to the `num_predict` ceiling, producing truncated, unparseable JSON.
 * `semanticTags` is capped at 5 to stop tag-list runaway.
 *
 * @param count - Number of chunks in the batch (== expected array length)
 */
export function buildEnrichmentSchema(count: number): Record<string, unknown> {
  return {
    type: 'array',
    minItems: count,
    maxItems: count,
    items: {
      type: 'object',
      required: ['description', 'businessContext', 'semanticTags'],
      properties: {
        description: {
          type: 'string',
          description: 'One sentence summary of what this chunk does',
        },
        businessContext: { type: 'string', description: 'Business domain this belongs to' },
        semanticTags: {
          type: 'array',
          items: { type: 'string' },
          minItems: 3,
          maxItems: 5,
          description: '3-5 lowercase tags like ["retry","payment","resilience"]',
        },
        relationships: {
          type: 'array',
          // Bounded to stop output-token runaway. Without maxItems the model
          // emits one relationship per import (often 8+), each with a long
          // path, blowing num_predict and truncating the JSON mid-array.
          maxItems: 3,
          items: {
            type: 'object',
            required: ['target', 'type'],
            properties: {
              // Filename only (e.g. "Foo.java"), not an absolute path — capped
              // so a single verbose relationship cannot exhaust the budget.
              target: { type: 'string', maxLength: 80 },
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
  };
}

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
Format: [{"description":"<1 sentence>","businessContext":"<domain>","semanticTags":["<3-7 lowercase>"],"relationships":[{"target":"<filename only, e.g. Foo.java>","type":"uses|implements|extends|configures|produces|consumes|tests"}]}]

${chunkBlocks}`;
}

/**
 * Parse the Ollama response into structured enrichment data.
 * Supports: flat array and legacy {chunks: [...]}.
 * Returns null if the response cannot be parsed.
 *
 * Note: a lone enrichment object (no array) is deliberately NOT accepted —
 * treating it as a 1-element result silently drops the rest of the batch.
 * The caller relies on a bounded array schema (see buildEnrichmentSchema) to
 * guarantee one object per chunk, and rejects length mismatches so they retry.
 */
export function parseEnrichmentResponse(rawResponse: string): EnrichedChunkResponse[] | null {
  try {
    // Strip <think>...</think> blocks (Ollama chain-of-thought safety net)
    const cleaned = rawResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    // Strip markdown code fences if present (safety net for models that ignore format:'json')
    const stripped = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const parsed: unknown = JSON.parse(stripped);

    // New format: flat array
    if (Array.isArray(parsed)) {
      return parsed as EnrichedChunkResponse[];
    }

    // Legacy format: { chunks: [...] }
    if (parsed !== null && typeof parsed === 'object' && 'chunks' in parsed) {
      const { chunks } = parsed as { chunks: unknown };
      if (Array.isArray(chunks)) {
        return chunks as EnrichedChunkResponse[];
      }
    }

    return null;
  } catch {
    return null;
  }
}
