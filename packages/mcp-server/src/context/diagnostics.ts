import { createHash } from 'node:crypto';
import type { VectorBranch } from '@ia-framework/core';

export const DIAGNOSTIC_KEYS = [
  'route',
  'executed_branches',
  'fallback_mode',
  'candidate_count',
  'selected_count',
  'deduplicated_count',
  'omitted_count',
  'expansion_count',
  'stale_count',
  'estimated_tokens',
  'configured_budget',
  'compaction_count',
  'exact_node_overflow',
] as const;

export interface DiagnosticsInput {
  route: string;
  executedBranches: VectorBranch[];
  fallbackMode: string | null;
  candidateCount: number;
  selectedCount: number;
  deduplicatedCount: number;
  omittedCount: number;
  expansionCount: number;
  staleCount: number;
  estimatedTokens: number;
  configuredBudget: number;
  compactionCount: number;
  exactNodeOverflow: boolean;
  /**
   * BUD-08: the amounts behind the overflow indicator. Present only when the
   * one-node exception actually fired, so a clean response carries no empty fields.
   */
  overflowAmounts?:
    | {
        configured: number;
        estimated: number;
        amount: number;
      }
    | undefined;
}

export type Diagnostics = {
  route: string;
  executed_branches: VectorBranch[];
  fallback_mode: string | null;
  candidate_count: number;
  selected_count: number;
  deduplicated_count: number;
  omitted_count: number;
  expansion_count: number;
  stale_count: number;
  estimated_tokens: number;
  configured_budget: number;
  compaction_count: number;
  exact_node_overflow: boolean;
  /** BUD-08: configured budget at the moment overflow fired. */
  exact_node_overflow_configured?: number;
  /** BUD-08: measured estimate of the overflowing serialized response. */
  exact_node_overflow_estimated?: number;
  /** BUD-08: estimated minus configured. */
  exact_node_overflow_amount?: number;
};

export function buildDiagnostics(input: DiagnosticsInput): Diagnostics {
  return {
    route: input.route,
    executed_branches: input.executedBranches,
    fallback_mode: input.fallbackMode,
    candidate_count: input.candidateCount,
    selected_count: input.selectedCount,
    deduplicated_count: input.deduplicatedCount,
    omitted_count: input.omittedCount,
    expansion_count: input.expansionCount,
    stale_count: input.staleCount,
    estimated_tokens: input.estimatedTokens,
    configured_budget: input.configuredBudget,
    compaction_count: input.compactionCount,
    exact_node_overflow: input.exactNodeOverflow,
    ...(input.overflowAmounts
      ? {
          exact_node_overflow_configured: input.overflowAmounts.configured,
          exact_node_overflow_estimated: input.overflowAmounts.estimated,
          exact_node_overflow_amount: input.overflowAmounts.amount,
        }
      : {}),
  };
}

export function diagnosticsAnomalyLines(input: {
  status: 'ok' | 'empty' | 'low_confidence' | 'unavailable' | 'refused';
  exactNodeOverflow: boolean;
}): string[] {
  return [
    ...(input.status !== 'ok' ? ['Degraded: retrieval is unavailable.'] : []),
    ...(input.exactNodeOverflow ? ['Exact node exceeded the configured budget.'] : []),
  ];
}

export function cacheFingerprint(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 32);
}
