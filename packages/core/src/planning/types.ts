import type { SparseVector } from '../lexical/sparse.js';

export type QueryIntent =
  | 'exact_symbol'
  | 'class_overview'
  | 'conceptual'
  | 'dependency_trace'
  | 'existence'
  | 'aggregation';

export type VectorBranch = 'semantic' | 'signature' | 'sparse';

/** The repository and metadata constraints applied to every retrieval path. */
export interface EffectiveFilter {
  repoId?: string;
  userFilters: Record<string, unknown>;
  excludeTests: boolean;
  reservedExclusion: boolean;
}

/** Internal retrieval ceilings, kept separate from the model-visible token budget. */
export interface CandidateLimits {
  retrieval: number;
}

export interface ResolvedBudget {
  limit: number;
  source: 'explicit' | 'adaptive';
}

export interface LineRange {
  startLine: number;
  endLine: number;
}

export interface SourceAnchor {
  repoId?: string;
  relativePath: string;
  symbol?: string;
  startLine: number;
  endLine: number;
}

export interface ContextItem {
  priority: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  anchor: SourceAnchor;
  form: 'source' | 'signature' | 'summary' | 'anchor-only';
  range?: LineRange;
  text?: string;
  provenance: {
    branch?: VectorBranch;
    expansionSource?: string;
    collection?: string;
  };
  stale?: boolean;
  signatureOnly?: boolean;
  degraded?: 'read-failed' | 'compacted';
}

export interface Diagnostics {
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
}

export interface QueryPlan {
  originalQuery: string;
  intent: QueryIntent;
  branches: VectorBranch[];
  representations: {
    semantic: string;
    signature: string;
    sparse: SparseVector;
  };
  lexical: {
    exactSymbols: string[];
    packageTerms: string[];
  };
  filter: EffectiveFilter;
  expansion: { hops: 0 | 1 | 2 };
  budget: ResolvedBudget;
  candidateLimits: CandidateLimits;
  templateId?: string;
  fingerprint: string;
}
