export interface EffectiveFilterInput {
  repoId?: string;
  userFilters: Record<string, unknown>;
  excludeTests: boolean;
}

export interface EffectiveFilter extends EffectiveFilterInput {
  reservedExclusion: boolean;
}

export function assertEffectiveFilter(
  value: unknown,
  operation: string,
): asserts value is EffectiveFilter {
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof (value as Partial<EffectiveFilter>).userFilters !== 'object' ||
    (value as Partial<EffectiveFilter>).userFilters === null ||
    typeof (value as Partial<EffectiveFilter>).excludeTests !== 'boolean' ||
    typeof (value as Partial<EffectiveFilter>).reservedExclusion !== 'boolean'
  ) {
    throw new Error(`EffectiveFilter is required for ${operation}`);
  }
}

export function createEffectiveFilter(
  userFilters: Record<string, unknown> = {},
  repoId?: string,
): EffectiveFilter {
  return {
    ...(repoId === undefined ? {} : { repoId }),
    userFilters,
    excludeTests: true,
    reservedExclusion: true,
  };
}

export function toQdrantFilter(filter: EffectiveFilter): Record<string, unknown> {
  const must = [
    ...((filter.userFilters.must as unknown[]) ?? []),
    ...(filter.repoId ? [{ key: 'repoId', match: { value: filter.repoId } }] : []),
  ];
  const mustNot = [
    ...((filter.userFilters.must_not as unknown[]) ?? []),
    ...(filter.excludeTests ? [{ key: 'stereotype', match: { value: 'test' } }] : []),
    ...(filter.reservedExclusion ? [{ key: 'kind', match: { value: '__ia_contract__' } }] : []),
  ];

  return {
    ...filter.userFilters,
    ...(must.length > 0 ? { must } : {}),
    ...(mustNot.length > 0 ? { must_not: mustNot } : {}),
  };
}
