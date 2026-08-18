import {
  estimateProviderInputTokens,
  type ModelCapabilities,
} from '@ia-framework/core';

export interface SizedInput {
  readonly id: string;
  /**
   * Largest per-request token count among the channels sent for this item.
   * Compared against `maxInputTokens` — each channel is a separate request, so
   * the binding per-request limit is the largest channel, not their sum.
   */
  readonly maxChannelTokens: number;
  /**
   * Sum of tokens across all channels sent for this item. Compared against
   * `maxRequestTokens` because every channel's request counts toward throughput.
   */
  readonly totalTokens: number;
}

/**
 * Build a SizedInput from the per-channel texts actually sent to the provider.
 * The embedder issues one request per channel (semantic, signature), so the
 * budgeter must measure them separately rather than as a single concatenation —
 * measuring the concatenation double-counts and false-positive-rejects chunks
 * whose channels each fit but whose combined text exceeds maxInputTokens.
 */
export function sizedInputFromChannels(id: string, channelTexts: string[]): SizedInput {
  let maxChannelTokens = 0;
  let totalTokens = 0;
  for (const text of channelTexts) {
    const tokens = estimateProviderInputTokens(text);
    if (tokens > maxChannelTokens) maxChannelTokens = tokens;
    totalTokens += tokens;
  }
  return { id, maxChannelTokens, totalTokens };
}

export interface PackedBatches {
  readonly batches: SizedInput[][];
  readonly oversized: SizedInput[];
}

export function packBatches(inputs: SizedInput[], caps: ModelCapabilities): PackedBatches {
  const maxBatchItems = caps.maxBatchItems ?? Number.POSITIVE_INFINITY;
  const maxRequestTokens = caps.maxRequestTokens ?? Number.POSITIVE_INFINITY;
  const batches: SizedInput[][] = [];
  const oversized: SizedInput[] = [];
  let current: SizedInput[] = [];
  let currentTokens = 0;

  for (const input of inputs) {
    // Per-item cap is the largest single channel (each channel is its own request).
    if (input.maxChannelTokens > caps.maxInputTokens) {
      oversized.push(input);
      continue;
    }

    const exceedsItems = current.length >= maxBatchItems;
    const exceedsTokens = current.length > 0 && currentTokens + input.totalTokens > maxRequestTokens;
    if (exceedsItems || exceedsTokens) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }

    current.push(input);
    currentTokens += input.totalTokens;
  }

  if (current.length > 0) batches.push(current);

  return { batches, oversized };
}
