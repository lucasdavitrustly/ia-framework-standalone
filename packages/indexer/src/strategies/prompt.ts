/**
 * Prompt template for LLM-based semantic chunking.
 * Per D-20: source code is presented with line numbers prepended.
 *
 * Ported from spike/llm-chunking/src/prompt.ts — validated in Phase 12 spike.
 */

import { createHash } from 'node:crypto';

/**
 * A short hash of the prompt template content for version tracking.
 * Changes automatically whenever the prompt text changes.
 * Used to detect prompt changes and invalidate caches.
 */
export const PROMPT_CONTENT_HASH: string = createHash('sha256')
  .update(buildPromptTemplate())
  .digest('hex')
  .slice(0, 8);

/**
 * Build the static prompt template (without dynamic content) for hashing.
 * Used only for computing PROMPT_CONTENT_HASH.
 */
function buildPromptTemplate(): string {
  return buildPrompt('', '', {}).trim();
}

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
 * @param options - Optional parameters including few-shot examples
 * @returns Formatted prompt string
 */
export function buildPrompt(
  sourceCode: string,
  fileName: string,
  options?: { examples?: { good: string; bad: string } },
): string {
  const lines = sourceCode.split('\n');
  const numberedLines = lines.map((line, idx) => `${idx + 1}: ${line}`).join('\n');

  const examplesSection = options?.examples
    ? `## Examples

GOOD boundary detection:
${options.examples.good}

BAD boundary detection (avoid this):
${options.examples.bad}

`
    : '';

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
- A class and all its methods MUST be a single chunk. Never split a class across chunks.
- If a class exceeds 100 lines, split into logical method groups but always prefix each sub-chunk summary with the class name.
- Minimum chunk size: 5 lines. Do not create chunks smaller than 5 lines — merge them with adjacent context.
- Summaries MUST describe what the code DOES using domain terminology (handles, validates, orchestrates, manages, transforms, routes, etc.)
- Do NOT describe syntax structure ("this function takes X and returns Y"). Describe PURPOSE and BEHAVIOR.

${examplesSection}File: ${fileName}

Source code:
${numberedLines}`;
}
