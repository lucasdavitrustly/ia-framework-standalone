/**
 * Prompt template for LLM-based semantic chunking.
 * Per D-20: source code is presented with line numbers prepended.
 */

/** JSON schema for the chunking output — exported for reference/testing */
export const CHUNK_JSON_SCHEMA = {
  type: 'object',
  properties: {
    chunks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          startLine: { type: 'integer' },
          endLine: { type: 'integer' },
          summary: { type: 'string' },
        },
        required: ['startLine', 'endLine', 'summary'],
      },
    },
  },
  required: ['chunks'],
};

/**
 * Build the prompt for LLM chunking.
 * Prepends line numbers to each source line per D-20.
 *
 * @param sourceCode - Raw file content
 * @param fileName - File name (relative path) for context
 * @returns Formatted prompt string
 */
export function buildPrompt(sourceCode: string, fileName: string): string {
  const lines = sourceCode.split('\n');
  const numberedLines = lines.map((line, idx) => `${idx + 1}: ${line}`).join('\n');

  return `You are a code analysis tool. Analyze the following source code and identify semantic boundaries — groups of lines that form a cohesive unit of functionality.

For each semantic chunk, provide:
- startLine: the first line number of the chunk (1-indexed, matching the line numbers shown)
- endLine: the last line number of the chunk (1-indexed, matching the line numbers shown)
- summary: a 1-3 sentence description of what this chunk does and why it matters

Rules:
- Every line of the file MUST be covered by exactly one chunk (no gaps, no overlaps)
- Chunk boundaries should align with semantic units (functions, classes, logical blocks)
- Import/export blocks should be their own chunk
- Summaries should describe the PURPOSE and BEHAVIOR, not just list identifiers
- Do NOT include import/export analysis — only semantic boundaries and prose summaries

File: ${fileName}

Source code:
${numberedLines}`;
}
