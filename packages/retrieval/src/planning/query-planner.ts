import {
  analyzeRetrievalQuery,
  buildSparseVector,
  QueryPlanError,
  tokenize,
} from '@ia-framework/core';
import type {
  EffectiveFilter,
  QueryIntent,
  QueryPlan,
  VectorBranch,
} from '@ia-framework/core';
import type { StoreCapabilities } from '@ia-framework/vector-store';
import { getRelatedTerms } from '../search-synonyms.js';

const DEFAULT_EXPANSION_HOPS = 1 as const;
const DEFAULT_RESULT_LIMIT = 10;

const COMPLEX_PATTERNS: RegExp[] = [
  /what\s+would\s+(happen|break|change|need)/i,
  /if\s+(i|we|you)\s+(want|need|change|add|remove|modify|refactor)/i,
  /how\s+do(es)?\s+.+\s+interact/i,
  /what\s+(patterns?|inconsistenc)/i,
  /across\s+(the|all|multiple|different)\s+(project|codebase|modules?|files?|packages?)/i,
  /impact\s+(of|analysis|if)/i,
  /end.to.end|full\s+flow|entire\s+(flow|pipeline|process)/i,
  /what\s+would\s+i\s+need\s+to\s+modify/i,
  /architecture|design\s+patterns?/i,
];

const SIMPLE_PATTERNS: RegExp[] = [
  /^(does|is)\s+(this|the|it|there)/i,
  /^where\s+is\s+\w+/i,
  /^(find|show|get)\s+(me\s+)?(the\s+)?\w+/i,
  /^what\s+is\s+\w+$/i,
];

const EXISTENCE_PATTERNS: RegExp[] = [
  /^does\s+(this|the|it|the\s+\w+)\s+(project\s+)?(use|have|contain|include|implement)/i,
  /^is\s+there\s+(a|an|any)/i,
  /^are\s+there\s+(any|some)/i,
  /^does\s+it\s+have/i,
  /^does\s+the\s+codebase\s+(use|have|contain|implement)/i,
];

const AGGREGATION_PATTERNS: RegExp[] = [
  /^(find|list|show|get|what are)\s+(all|every)\s/i,
  /^(where are|show me)\s+(all|every)\s/i,
  /\ball\s+(the\s+)?(endpoints|routes|controllers|services|tests|interfaces|types|models|schemas|handlers|hooks|components|modules|classes|functions|methods|middlewares?|providers?|repositories|factories|decorators?|validators?|guards?)/i,
  /^how many\s/i,
];

const TEST_INTENT_PATTERNS: RegExp[] = [
  /\btest\b/i,
  /\btests\b/i,
  /\btested\b/i,
  /\btesting\b/i,
  /\bspec\b/i,
  /\bspecs\b/i,
  /\bcoverage\b/i,
  /\bunit test\b/i,
  /\btest case/i,
  /\btest helper/i,
  /\bmock\b/i,
  /\bmocks\b/i,
  /\bstub\b/i,
  /\bfake\b/i,
  /\bfixture/i,
];

const DEPENDENCY_PATTERN =
  /\b(imports?|imported|dependencies?|depends on|dependency|wiring|calls?|called by|uses?)\b/i;
const CLASS_OVERVIEW_PATTERN =
  /^(?:what|who)\s+(?:is|are)\s+(?:an?\s+)?[A-Z][A-Za-z0-9_$]*(?:[.?!)\]]*)$/;
const IDENTIFIER_PATTERN = /[A-Za-z_$][A-Za-z0-9_$]*/g;
const QUALIFIED_SYMBOL_PATTERN =
  /\b[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.|::)[A-Za-z_$][A-Za-z0-9_$]*)+\b/g;
const PATH_PATTERN =
  /(?:^|[\s("'`])((?:\.\.?\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)/g;
const QUOTED_PATTERN = /(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\1/g;
const STOP_SYMBOLS = new Set([
  'A',
  'An',
  'Are',
  'How',
  'Is',
  'What',
  'Where',
  'Who',
  'Why',
]);

export type QueryRoute = 'keyword' | 'semantic' | 'existence' | 'aggregation';

export type PlannedQuery = QueryPlan & { route: QueryRoute };

export interface PlanInput {
  query: string;
  queryPrefix?: string | undefined;
  prefixes?: { query: string } | undefined;
  repo?: string | undefined;
  repoId?: string | undefined;
  stereotype?: string | undefined;
  archLayer?: string | undefined;
  module?: string | undefined;
  language?: string | undefined;
  filter?: Record<string, unknown> | undefined;
  userFilters?: Record<string, unknown> | undefined;
  excludeTests?: boolean | undefined;
  expansionHops?: number | undefined;
  expand_hops?: number | undefined;
  expansion?: { hops?: number | undefined } | undefined;
  limit?: number | undefined;
  maxTokens?: number | undefined;
  budget?: number | undefined;
  templateId?: string | undefined;
}

interface LexicalEvidence {
  terms: string[];
  exactSymbols: string[];
  quotedTerms: string[];
  packageTerms: string[];
  pathTerms: string[];
  annotations: string[];
  classTerms: string[];
  methodTerms: string[];
}

/** Builds one deterministic, local query plan for both retrieval consumers. */
export class QueryPlanner {
  plan(input: PlanInput, capabilities: StoreCapabilities): PlannedQuery {
    this.validateInput(input, capabilities);

    const evidence = extractLexicalEvidence(input.query);
    const analyzed = analyzeRetrievalQuery(input.query);
    const intent = deriveIntent(input.query, evidence);
    const route = deriveRoute(intent);
    const synonyms = getRelatedTerms(input.query);
    const sparseSources = unique([
      ...(synonyms.length > 0 ? [input.query] : []),
      ...evidence.exactSymbols,
      ...evidence.quotedTerms,
      ...evidence.packageTerms,
      ...evidence.pathTerms,
      ...evidence.annotations,
      ...synonyms,
    ]);
    const sparse = buildSparseVector(sparseSources);
    const semantic = `${input.queryPrefix ?? input.prefixes?.query ?? ''}${input.query}`;
    const signature = renderSignature(intent, evidence, analyzed);
    const branches = deriveBranches(intent, evidence, sparse.indices.length > 0, capabilities.sparse);
    const filter = buildFilter(input, hasTestIntent(input.query));
    const budget = resolveBudget(input);
    const candidateLimits = resolveCandidateLimits(input);
    const plan: PlannedQuery = {
      originalQuery: input.query,
      intent,
      route,
      branches,
      representations: { semantic, signature, sparse },
      lexical: {
        exactSymbols: evidence.exactSymbols,
        packageTerms: evidence.packageTerms,
      },
      filter,
      expansion: { hops: resolveExpansionHops(input) },
      budget,
      candidateLimits,
      ...(input.templateId === undefined ? {} : { templateId: input.templateId }),
      fingerprint: '',
    };

    plan.fingerprint = fingerprint(plan);
    return plan;
  }

  private validateInput(input: PlanInput, capabilities: StoreCapabilities): void {
    if (!input || typeof input.query !== 'string' || input.query.trim().length === 0) {
      throw new QueryPlanError(typeof input?.query === 'string' ? input.query : '', 'query must not be empty');
    }

    if (!capabilities || typeof capabilities.sparse !== 'boolean') {
      throw new QueryPlanError(input.query, 'store capabilities must declare sparse support');
    }
  }
}

function deriveIntent(query: string, evidence: LexicalEvidence): QueryIntent {
  const trimmed = query.trim();

  if (AGGREGATION_PATTERNS.some((pattern) => pattern.test(trimmed))) return 'aggregation';
  if (EXISTENCE_PATTERNS.some((pattern) => pattern.test(trimmed))) return 'existence';
  if (DEPENDENCY_PATTERN.test(trimmed)) return 'dependency_trace';
  if (CLASS_OVERVIEW_PATTERN.test(trimmed)) return 'class_overview';

  const definitionMatch = trimmed.match(
    /^(?:what|who)\s+(?:is|are)\s+(?:an?\s+)?([A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.|::)[A-Za-z_$][A-Za-z0-9_$]*)?)\??$/i,
  );
  if (definitionMatch?.[1] && evidence.exactSymbols.length > 0) {
    return 'exact_symbol';
  }

  const words = trimmed.split(/\s+/);
  const exactLookup =
    evidence.exactSymbols.length > 0 &&
    (words.length === 1 || /^(?:find|get|show|locate|where)\b/i.test(trimmed));
  if (exactLookup) return 'exact_symbol';

  return 'conceptual';
}

function deriveRoute(intent: QueryIntent): QueryRoute {
  switch (intent) {
    case 'exact_symbol':
      return 'keyword';
    case 'existence':
      return 'existence';
    case 'aggregation':
      return 'aggregation';
    case 'class_overview':
    case 'conceptual':
    case 'dependency_trace':
      return 'semantic';
  }
}

function deriveBranches(
  intent: QueryIntent,
  evidence: LexicalEvidence,
  hasSparseTerms: boolean,
  sparseSupported: boolean,
): VectorBranch[] {
  const branches = new Set<VectorBranch>();
  const hasStructuralEvidence =
    evidence.exactSymbols.length > 0 ||
    evidence.packageTerms.length > 0 ||
    evidence.pathTerms.length > 0 ||
    evidence.annotations.length > 0;

  switch (intent) {
    case 'exact_symbol':
      branches.add('signature');
      break;
    case 'class_overview':
      branches.add('semantic');
      branches.add('signature');
      break;
    case 'conceptual':
      branches.add('semantic');
      if (hasStructuralEvidence) branches.add('signature');
      break;
    case 'dependency_trace':
      branches.add('semantic');
      if (hasStructuralEvidence) branches.add('signature');
      break;
    case 'existence':
    case 'aggregation':
      branches.add('semantic');
      break;
  }

  if (hasSparseTerms && sparseSupported && (hasStructuralEvidence || evidence.quotedTerms.length > 0)) {
    branches.add('sparse');
  }

  return ['semantic', 'signature', 'sparse'].filter((branch) =>
    branches.has(branch as VectorBranch),
  ) as VectorBranch[];
}

function extractLexicalEvidence(query: string): LexicalEvidence {
  const terms = unique(tokenize(query));
  const quotedTerms = unique(
    Array.from(query.matchAll(QUOTED_PATTERN), (match) => match[2] ?? '').filter(Boolean),
  );
  const pathTerms = unique(
    Array.from(query.matchAll(PATH_PATTERN), (match) => match[1] ?? '').filter(Boolean),
  );
  const qualifiedSymbols = Array.from(query.matchAll(QUALIFIED_SYMBOL_PATTERN), (match) => match[0]).filter(
    (symbol) => !pathTerms.some((path) => path.includes(symbol)),
  );
  const qualifiedParts = new Set(
    qualifiedSymbols.flatMap((symbol) => symbol.split(/\.|::/)),
  );
  const standaloneSymbols = Array.from(query.matchAll(IDENTIFIER_PATTERN), (match) => match[0]).filter(
    (term) =>
      isExactIdentifier(term) &&
      !STOP_SYMBOLS.has(term) &&
      !qualifiedParts.has(term) &&
      !pathTerms.some((path) => path.includes(term)),
  );
  const exactSymbols = unique([
    ...qualifiedSymbols,
    ...standaloneSymbols,
    ...quotedTerms.filter(isExactIdentifier),
  ]);
  const analyzed = analyzeRetrievalQuery(query);
  const packageTerms = unique(analyzed.packageTerms);
    const annotations = unique(
      Array.from(query.matchAll(/@[A-Za-z_$][A-Za-z0-9_$]*/g), (match) => match[0]),
    );
  const classTerms = unique(
    exactSymbols.flatMap((term) => {
      const parts = term.split(/\.|::/);
      const classParts = parts.slice(0, -1).filter((part) => /^[A-Z][A-Za-z0-9_$]*$/.test(part));
      return classParts.length > 0
        ? classParts
        : /^[A-Z][A-Za-z0-9_$]*$/.test(term)
          ? [term]
          : [];
    }),
  );
  const methodTerms = unique(
    exactSymbols.flatMap((term) => {
      const parts = term.split(/\.|::/);
      const lastPart = parts.at(-1);
      if (lastPart === undefined) return [];
      if (packageTerms.includes(term)) return [];
      if (parts.length > 1 && /^[a-z_$]/.test(lastPart)) return [lastPart];
      return /^[a-z_$][A-Za-z0-9_$]*$/.test(term) ? [term] : [];
    }),
  );

  return {
    terms,
    exactSymbols,
    quotedTerms,
    packageTerms,
    pathTerms,
    annotations,
    classTerms,
    methodTerms,
  };
}

function isExactIdentifier(term: string): boolean {
  return (
    /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(term) &&
    (/[A-Z]/.test(term) || /_/.test(term) || /^[a-z_$]+[A-Z]/.test(term))
  );
}

function renderSignature(
  intent: QueryIntent,
  evidence: LexicalEvidence,
  analyzed: ReturnType<typeof analyzeRetrievalQuery>,
): string {
  const constructType =
    intent === 'class_overview'
      ? 'class'
      : intent === 'dependency_trace'
        ? 'import'
        : intent === 'exact_symbol'
          ? evidence.methodTerms.length > 0
            ? 'method'
            : 'class'
          : 'construct';
  const parts = [
    `construct:${constructType}`,
    `symbols:${evidence.exactSymbols.join(',') || 'none'}`,
    `classes:${evidence.classTerms.join(',') || 'none'}`,
    `methods:${evidence.methodTerms.join(',') || 'none'}`,
    `packages:${evidence.packageTerms.join(',') || 'none'}`,
    `paths:${evidence.pathTerms.join(',') || 'none'}`,
    `annotations:${evidence.annotations.join(',') || 'none'}`,
    `intent:${intent}`,
    `query-signals:${[
      ...analyzed.symbolTerms,
      ...analyzed.packageTerms,
      ...(analyzed.architectureQuery ? ['architecture'] : []),
      ...(analyzed.dataFlowQuery ? ['data-flow'] : []),
      ...(analyzed.entryPointQuery ? ['entry-point'] : []),
    ].join(',') || 'none'}`,
  ];

  return parts.join('\n');
}

function buildFilter(input: PlanInput, testIntent: boolean): EffectiveFilter {
  const userFilters = mergeFilters(input);
  const existingMust = isUnknownArray(userFilters.must) ? [...userFilters.must] : [];
  const namedFilters: Array<[string, string | undefined]> = [
    ['stereotype', input.stereotype],
    ['archLayer', input.archLayer],
    ['moduleInfo.module', input.module],
    ['language', input.language],
  ];

  for (const [key, value] of namedFilters) {
    if (value !== undefined) existingMust.push({ key, match: { value } });
  }
  if (existingMust.length > 0) userFilters.must = existingMust;

  const repoId = input.repoId ?? input.repo;
  return {
    ...(repoId === undefined ? {} : { repoId }),
    userFilters,
    excludeTests: input.excludeTests ?? (hasExplicitStereotypeFilter(input, userFilters) ? false : !testIntent),
    reservedExclusion: true,
  };
}

function mergeFilters(input: PlanInput): Record<string, unknown> {
  const filter = validateFilter(input.filter, input.query, 'filter');
  const userFilters = validateFilter(input.userFilters, input.query, 'userFilters');
  const merged: Record<string, unknown> = { ...filter };

  for (const [key, value] of Object.entries(userFilters)) {
    const current = merged[key];
    if (current === undefined) {
      merged[key] = value;
      continue;
    }

    if (isUnknownArray(current) && isUnknownArray(value)) {
      merged[key] = [...current, ...value];
      continue;
    }

    if (JSON.stringify(current) !== JSON.stringify(value)) {
      throw new QueryPlanError(input.query, `conflicting values for filter key "${key}"`);
    }
  }

  return merged;
}

function validateFilter(
  value: Record<string, unknown> | undefined,
  query: string,
  name: string,
): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new QueryPlanError(query, `${name} must be an object`);
  }

  for (const key of ['must', 'must_not', 'should']) {
    if (key in value && !isUnknownArray(value[key])) {
      throw new QueryPlanError(query, `${name}.${key} must be an array`);
    }
  }
  return { ...value };
}

function hasExplicitStereotypeFilter(input: PlanInput, userFilters: Record<string, unknown>): boolean {
  if (input.stereotype !== undefined) return true;
  return ['must', 'must_not', 'should'].some((clause) => {
    const conditions = isUnknownArray(userFilters[clause]) ? userFilters[clause] : [];
    return conditions.some(
      (condition) =>
        typeof condition === 'object' &&
        condition !== null &&
        (condition as { key?: unknown }).key === 'stereotype',
    );
  });
}

function resolveExpansionHops(input: PlanInput): 0 | 1 | 2 {
  const configured = input.expansionHops ?? input.expand_hops ?? input.expansion?.hops;
  const hops = configured ?? DEFAULT_EXPANSION_HOPS;
  if (hops !== 0 && hops !== 1 && hops !== 2) {
    throw new QueryPlanError(input.query, 'expansion hops must be 0, 1, or 2');
  }
  return hops;
}

function resolveBudget(input: PlanInput): QueryPlan['budget'] {
  const explicit = input.maxTokens ?? input.budget;
  if (explicit !== undefined) {
    if (typeof explicit !== 'number' || !Number.isFinite(explicit) || explicit < 0) {
      throw new QueryPlanError(input.query, 'budget must be a non-negative finite number');
    }
    return {
      limit: explicit,
      source: 'explicit',
    };
  }

  return {
    limit: adaptiveBudget(input.query),
    source: 'adaptive',
  };
}

function adaptiveBudget(query: string): number {
  const trimmed = query.trim();
  if (COMPLEX_PATTERNS.some((pattern) => pattern.test(trimmed))) return 40_000;
  if (SIMPLE_PATTERNS.some((pattern) => pattern.test(trimmed))) return 8_000;

  const wordCount = trimmed.split(/\s+/).length;
  const hasConjunction = /\band\b|\balso\b|\badditionally\b/i.test(trimmed);
  const multipleQuestions = (trimmed.match(/\?/g) ?? []).length > 1;
  if (wordCount <= 5 && !hasConjunction && !multipleQuestions) return 8_000;
  if (wordCount <= 12 && !hasConjunction && !multipleQuestions) return 20_000;
  return 40_000;
}

function resolveCandidateLimits(input: PlanInput): QueryPlan['candidateLimits'] {
  const limit = input.limit ?? DEFAULT_RESULT_LIMIT;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
    throw new QueryPlanError(input.query, 'result limit must be a positive integer');
  }

  return { retrieval: limit };
}

function hasTestIntent(query: string): boolean {
  const normalized = query.toLowerCase();
  return TEST_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function fingerprint(plan: PlannedQuery): string {
  const canonical = JSON.stringify({
    originalQuery: plan.originalQuery,
    intent: plan.intent,
    route: plan.route,
    branches: plan.branches,
    representations: plan.representations,
    lexical: plan.lexical,
    filter: plan.filter,
    expansion: plan.expansion,
    budget: plan.budget,
    candidateLimits: plan.candidateLimits,
    templateId: plan.templateId ?? null,
  });
  let hash = 2166136261;
  for (const character of canonical) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
