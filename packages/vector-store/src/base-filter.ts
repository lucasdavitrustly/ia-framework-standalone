const RESERVED_CONTRACT_CLAUSE = {
  key: 'kind',
  match: { value: '__ia_contract__' },
} as const;

export function baseFilter(userFilter?: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(userFilter ?? {}),
    must_not: [
      ...((userFilter?.must_not as unknown[]) ?? []),
      RESERVED_CONTRACT_CLAUSE,
    ],
  };
}
