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

  return `You are a code analysis tool for a payment gateway system. This system processes RTP (Real-Time Payments) and ACH transactions using a Command-Query Separation (CQS) architecture, PostgreSQL for persistence, and RabbitMQ as the event bus. Payment processors are integrated via adapter pattern, allowing different providers to be plugged in or reused.

Analyze the following source code and identify semantic boundaries — groups of lines that form a cohesive unit of functionality.

For each semantic chunk, provide:
- startLine: the first line number of the chunk (1-indexed, matching the line numbers shown)
- endLine: the last line number of the chunk (1-indexed, matching the line numbers shown)
- summary: a 1-3 sentence description of what this chunk does and why it matters

## Summary Format

Write summaries as: [Verb] [what] [for/to domain purpose]

GOOD summaries:
- "Validates RTP transfer amounts against account balance before submitting to the payment processor adapter"
- "Orchestrates ACH batch processing by dispatching individual payment commands to RabbitMQ for async execution"
- "Implements the payment processor adapter interface for Fifth Third Bank RTP integration"
- "Queries PostgreSQL for pending transfer records filtered by processor type and settlement status"
- "Handles RabbitMQ consumer events for payment status callbacks and updates transfer state accordingly"

BAD summaries (DO NOT write these):
- "This class contains methods for processing" (too vague, no domain context)
- "Helper function that takes a request and returns a response" (describes syntax, not purpose)
- "Utility for handling data" (meaningless — what data? what handling?)
- "TransferService class with create, update, and delete methods" (lists identifiers, not behavior)
- "Contains configuration" (what configuration? for what system?)

## Rules

- Every line of the file MUST be covered by exactly one chunk (no gaps, no overlaps)
- Chunk boundaries should align with semantic units (functions, classes, logical blocks)
- Import/export blocks should be their own chunk
- A class and all its methods MUST be a single chunk. Never split a class across chunks.
- If a class exceeds 200 lines, split into logical method groups (e.g., command handlers vs query handlers, lifecycle methods vs business logic, public API vs private helpers). Always prefix each sub-chunk summary with the class name.
- Minimum chunk size: 5 lines. Do not create chunks smaller than 5 lines — merge them with adjacent context.
- Never split a decorator or annotation from the method or class it annotates. If a method has @Transactional @CacheEvict, the annotations MUST appear in the same chunk as the method signature and body. If a class has @Aspect @Component, those annotations MUST be in the class chunk.
- Summaries MUST use domain terminology: payment, transfer, settlement, processor, adapter, command, query, event, routing, validation, reconciliation, batch, callback, etc.
- Summaries MUST describe PURPOSE and BEHAVIOR, not syntax structure.
- Do NOT include import/export analysis — only semantic boundaries and prose summaries.

${examplesSection}File: ${fileName}

Source code:
${numberedLines}`;
}
