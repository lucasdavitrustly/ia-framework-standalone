import type { EmbeddingTaskType } from './interface.js';

export interface EmbeddingPrefixes {
  document: string;
  query: string;
}

/** Applies the configured task prefix once per provider call; existing prefixes are not detected. */
export function applyPrefix(
  text: string,
  taskType?: EmbeddingTaskType,
  prefixes?: EmbeddingPrefixes,
): string {
  if (!taskType || !prefixes) return text;
  return prefixes[taskType] + text;
}
