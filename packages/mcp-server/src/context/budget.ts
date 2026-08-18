import { estimateTokens } from '@ia-framework/core';
import type { ContextItem } from '@ia-framework/core';

/** TD-12: fixed conservative allowance reserved before evidence assembly. */
export const DIAGNOSTICS_RESERVATION = 256;

/**
 * BUD-10: ceiling on the signature head kept by the compacted form. Bounds the
 * cost of a minified or single-line body, whose first line is the whole body.
 */
export const SIGNATURE_HEAD_MAX = 120;

export interface AdaptiveBudget {
  simple: number;
  moderate: number;
  complex: number;
}

export interface BudgetInput {
  budget?: unknown;
}

export interface ResolvedBudget {
  limit: number;
  source: 'explicit' | 'adaptive';
}

export interface OverflowReport {
  exact_node_overflow: true;
  configured: number;
  estimated: number;
  amount: number;
  evidenceBudget: number;
}

export interface BudgetEnforcement {
  included: ContextItem[];
  compacted: number;
  omitted: number;
  candidateCount: number;
  selectedCount: number;
  estimatedTokens: number;
  evidenceBudget: number;
  overflow?: OverflowReport;
  failure?: string;
}

/**
 * BUD-05/BUD-12: result of enforcing the budget on the measured serialized
 * response. `estimatedTokens` always describes `response`, never a sum of item
 * estimates.
 */
export interface SerializedBudgetEnforcement extends BudgetEnforcement {
  /** The final serialized response object the caller should return. */
  response: unknown;
  /** Serialization passes used. D-1 bounds this to 2. */
  passes: 1 | 2;
}

/** D-1: assemble → serialize → measure → re-trim once → re-serialize. */
export const MAX_SERIALIZATION_PASSES = 2;

export class BudgetGovernor {
  resolve(input: BudgetInput, adaptive: number): ResolvedBudget {
    if (input.budget !== undefined) {
      if (typeof input.budget !== 'number' || !Number.isFinite(input.budget) || input.budget < 0) {
        throw new Error('budget must be a non-negative finite number');
      }
      return { limit: input.budget, source: 'explicit' };
    }

    if (!Number.isFinite(adaptive) || adaptive < 0) {
      throw new Error('adaptive budget must be a non-negative finite number');
    }
    return { limit: adaptive, source: 'adaptive' };
  }

  diagnosticsAllowance(budget: number): number {
    if (budget <= 0) return 0;
    return Math.min(budget, DIAGNOSTICS_RESERVATION);
  }

  evidenceBudget(budget: number): number {
    if (budget <= 0) return 0;
    return Math.max(0, budget - this.diagnosticsAllowance(budget));
  }

  enforce(items: ContextItem[], budget: ResolvedBudget): BudgetEnforcement {
    const evidenceBudget = this.evidenceBudget(budget.limit);
    if (budget.limit === 0) {
      const included = items
        .map((item, index) => ({ item, index }))
        .sort((left, right) => left.item.priority - right.item.priority || left.index - right.index)
        .map(({ item }) => item);
      return {
        included,
        compacted: 0,
        omitted: 0,
        candidateCount: items.length,
        selectedCount: items.length,
        estimatedTokens: items.reduce((total, item) => total + estimateItem(item), 0),
        evidenceBudget: 0,
      };
    }

    const ordered = items.map((item, index) => ({ item, index })).sort((left, right) => {
      return left.item.priority - right.item.priority || left.index - right.index;
    });
    const included: ContextItem[] = [];
    let estimatedTokens = 0;
    let compacted = 0;
    let omitted = 0;
    let overflow: OverflowReport | undefined;
    let failure: string | undefined;
    let overflowUsed = false;

    for (const { item } of ordered) {
      if (item.degraded === 'read-failed') {
        omitted++;
        failure = 'exact node read-failed';
        continue;
      }

      const estimate = estimateItem(item);
      if (estimatedTokens + estimate <= evidenceBudget) {
        included.push(item);
        estimatedTokens += estimate;
        continue;
      }

      if (item.priority === 1 && !overflowUsed) {
        included.push(item);
        estimatedTokens += estimate;
        overflowUsed = true;
        overflow = {
          exact_node_overflow: true,
          configured: budget.limit,
          estimated: estimate,
          amount: estimate - evidenceBudget,
          evidenceBudget,
        };
        continue;
      }

      const compactedItem = compactItem(item);
      const compactEstimate = estimateItem(compactedItem);
      if (compactEstimate < estimate && estimatedTokens + compactEstimate <= evidenceBudget) {
        included.push(compactedItem);
        estimatedTokens += compactEstimate;
        compacted++;
      } else {
        omitted++;
      }
    }

    return {
      included,
      compacted,
      omitted,
      candidateCount: items.length,
      selectedCount: included.length,
      estimatedTokens,
      evidenceBudget,
      ...(overflow ? { overflow } : {}),
      ...(failure ? { failure } : {}),
    };
  }

  /**
   * BUD-05/BUD-12/BUD-13: enforce the budget on the **measured serialized
   * response**. Assemble → serialize → measure the real string → if over budget,
   * re-trim from the bottom of the BUD-07 ladder → re-serialize once (D-1).
   *
   * Deterministic: the drop order is the priority ladder, and the second pass
   * sizes itself from the measured overhead of the first.
   */
  enforceSerialized(
    items: ContextItem[],
    budget: ResolvedBudget,
    serialize: (included: ContextItem[]) => unknown,
  ): SerializedBudgetEnforcement {
    const first = this.enforce(items, budget);
    const firstResponse = serialize(first.included);
    const firstMeasured = estimateTokens(JSON.stringify(firstResponse));

    if (budget.limit === 0 || firstMeasured <= budget.limit) {
      return {
        ...first,
        estimatedTokens: firstMeasured,
        ...(first.overflow
          ? {
              overflow: {
                ...first.overflow,
                estimated: firstMeasured,
                amount: Math.max(0, firstMeasured - budget.limit),
              },
            }
          : {}),
        response: firstResponse,
        passes: 1,
      };
    }

    // The serialized response costs more than the sum of its items: headers, code
    // fences, the guardrail lead, templates and diagnostics are real tokens. Size
    // the second pass against that measured overhead.
    const itemCost = first.included.reduce((total, item) => total + estimateItem(item), 0);
    const overhead = Math.max(0, firstMeasured - itemCost);
    const itemAllowance = budget.limit - overhead;

    const retrimmed: ContextItem[] = [];
    let compacted = first.compacted;
    let omitted = first.omitted;
    let spent = 0;
    for (const [index, item] of first.included.entries()) {
      const estimate = estimateItem(item);
      if (spent + estimate <= itemAllowance) {
        retrimmed.push(item);
        spent += estimate;
        continue;
      }

      // BUD-08/BUD-09: the highest-priority node — the exact requested one when
      // present — is included complete rather than truncated or dropped, even when
      // the serialized overhead alone consumes the budget. Lower priorities yield.
      if (index === 0) {
        retrimmed.push(item);
        spent += estimate;
        continue;
      }

      // Already compacted by the first pass and still too large: drop it.
      if (item.degraded === 'compacted') {
        compacted = Math.max(0, compacted - 1);
        omitted++;
        continue;
      }

      const compactedItem = compactItem(item);
      const compactEstimate = estimateItem(compactedItem);
      if (compactEstimate < estimate && spent + compactEstimate <= itemAllowance) {
        retrimmed.push(compactedItem);
        spent += compactEstimate;
        compacted++;
      } else {
        omitted++;
      }
    }

    const response = serialize(retrimmed);
    const measured = estimateTokens(JSON.stringify(response));
    // BUD-08: after re-trimming the ladder bottom, any remaining excess is
    // irreducible — the protected top-of-ladder evidence plus the mandatory
    // response frame. Report it with its amounts rather than exceeding silently.
    const overflow =
      measured > budget.limit && retrimmed.length > 0
        ? {
            exact_node_overflow: true as const,
            configured: budget.limit,
            estimated: measured,
            amount: measured - budget.limit,
            evidenceBudget: first.evidenceBudget,
          }
        : undefined;

    return {
      included: retrimmed,
      compacted,
      omitted,
      candidateCount: items.length,
      selectedCount: retrimmed.length,
      estimatedTokens: measured,
      evidenceBudget: first.evidenceBudget,
      ...(overflow ? { overflow } : {}),
      ...(first.failure ? { failure: first.failure } : {}),
      response,
      passes: MAX_SERIALIZATION_PASSES,
    };
  }
}

/**
 * BUD-10: render the compacted form (anchor + signature head) into `text`, so the
 * compacted item genuinely costs less than the original body.
 */
export function compactItem(item: ContextItem): ContextItem {
  return {
    ...item,
    form: 'anchor-only',
    degraded: 'compacted',
    text: renderCompactText(item),
  };
}

function renderCompactText(item: ContextItem): string {
  const anchorLine = `${item.anchor.relativePath}:${item.anchor.startLine}-${item.anchor.endLine}${
    item.anchor.symbol ? ` (${item.anchor.symbol})` : ''
  }`;
  const head = signatureHead(item.text);
  return head ? `${anchorLine}\n${head}` : anchorLine;
}

function signatureHead(text: string | undefined): string {
  const firstLine = (text ?? '').split('\n').find((line) => line.trim().length > 0)?.trim() ?? '';
  const declaration = (firstLine.split('{')[0] ?? '').trim() || firstLine;
  return declaration.length > SIGNATURE_HEAD_MAX
    ? `${declaration.slice(0, SIGNATURE_HEAD_MAX)}…`
    : declaration;
}

export function estimateItem(item: ContextItem): number {
  return estimateTokens(
    [
      item.text ?? '',
      item.anchor.repoId ?? '',
      item.anchor.relativePath,
      item.anchor.symbol ?? '',
      `${item.anchor.startLine}-${item.anchor.endLine}`,
    ].join('\n'),
  );
}
