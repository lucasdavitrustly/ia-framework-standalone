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
}

export interface EnrichedChunkResponse {
  id: string;
  description: string;
  businessContext: string;
  semanticTags: string[];
  relationships: Array<{
    target: string;
    type: 'uses' | 'implements' | 'extends' | 'configures' | 'produces' | 'consumes' | 'tests';
    label?: string | undefined;
  }>;
}

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
 * Build the enrichment prompt for a batch of chunks.
 *
 * Each chunk's content is shown in a clearly delimited block so the LLM
 * understands the file-level structure. The system prompt instructs the LLM
 * to respond with structured JSON only.
 *
 * @param chunks - Batch of code chunks (max 10 recommended)
 * @param filePath - The file path (for context)
 */
export function buildEnrichmentPrompt(chunks: ChunkForPrompt[], filePath: string): string {
  const chunkBlocks = chunks
    .map((chunk) => {
      const header = [
        `=== CHUNK id="${chunk.id}" name="${chunk.name ?? '(unnamed)'}" type="${chunk.chunkType}" ===`,
      ];
      if (chunk.annotations && chunk.annotations.length > 0) {
        header.push(`annotations: ${chunk.annotations.join(', ')}`);
      }
      if (chunk.imports && chunk.imports.length > 0) {
        header.push(
          `imports: ${chunk.imports.slice(0, 5).join(', ')}${chunk.imports.length > 5 ? '...' : ''}`,
        );
      }
      return [...header, chunk.content, `=== END CHUNK id="${chunk.id}" ===`].join('\n');
    })
    .join('\n\n');

  return `You are a code analysis assistant. Analyze the following ${chunks[0]?.language ?? 'code'} chunks from file "${filePath}" and return enrichment metadata as JSON.

For each chunk, provide:
- description: one concise sentence describing what this code does
- businessContext: the business domain or use case this belongs to
- semanticTags: 3-7 lowercase keywords for semantic search (e.g. ["retry","payment","resilience"])
- relationships: list of dependencies/usages with target filename, relation type, and optional label

Return ONLY valid JSON matching this structure:
{
  "chunks": [
    {
      "id": "<chunk id>",
      "description": "...",
      "businessContext": "...",
      "semanticTags": ["tag1", "tag2"],
      "relationships": [{"target": "SomeFile.java", "type": "uses", "label": "optional context"}]
    }
  ]
}

${chunkBlocks}

Respond with JSON only. No markdown, no explanation.`;
}

/**
 * Parse the Ollama response into structured enrichment data.
 * Returns null if the response cannot be parsed.
 */
export function parseEnrichmentResponse(rawResponse: string): PromptResponse | null {
  try {
    // Strip <think>...</think> blocks (Ollama chain-of-thought)
    const cleaned = rawResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    // Strip markdown code fences if present
    const stripped = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const parsed = JSON.parse(stripped) as PromptResponse;
    if (!parsed.chunks || !Array.isArray(parsed.chunks)) return null;
    return parsed;
  } catch {
    return null;
  }
}
