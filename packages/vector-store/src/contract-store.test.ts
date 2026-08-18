import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmbeddingContract } from '@ia-framework/core';
import {
  EmbeddingContractMismatchError,
  UnknownContractError,
} from '@ia-framework/core';
import { ContractStore } from './contract-store.js';

const CONTRACT: EmbeddingContract = {
  provider: 'openai',
  model: 'text-embedding-3-small',
  dimension: 3,
  prefixes: { document: 'doc: ', query: 'query: ' },
  tokenizerVersion: 1,
  sparseHashVersion: 1,
};

function makeClient() {
  return {
    retrieve: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ status: 'completed' }),
  };
}

describe('ContractStore', () => {
  let client: ReturnType<typeof makeClient>;
  let store: ContractStore;

  beforeEach(() => {
    client = makeClient();
    store = new ContractStore(client, 'contracts');
  });

  it('writes the contract at a fixed deterministic UUID', async () => {
    await store.writeContract(CONTRACT, 'generation-1');
    await store.writeContract(CONTRACT, 'generation-2');

    expect(client.upsert).toHaveBeenCalledTimes(2);
    const first = client.upsert.mock.calls[0] as [string, { wait: boolean; points: unknown[] }];
    const second = client.upsert.mock.calls[1] as [string, { wait: boolean; points: unknown[] }];
    expect(first[0]).toBe('contracts');
    expect(first[1].wait).toBe(true);
    expect(first[1].points[0]).toMatchObject({ id: (second[1].points[0] as { id: string }).id });
  });

  it('writes the complete reserved contract payload', async () => {
    await store.writeContract(CONTRACT, 'generation-1');

    const [, args] = client.upsert.mock.calls[0] as [string, { points: Array<{ payload: Record<string, unknown> }> }];
    expect(args.points[0]!.payload).toMatchObject({
      kind: '__ia_contract__',
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimension: 3,
      prefixes: { document: 'doc: ', query: 'query: ' },
      tokenizerVersion: 1,
      sparseHashVersion: 1,
      indexGeneration: 'generation-1',
    });
    expect(args.points[0]!.payload.writtenAt).toEqual(expect.any(String));
  });

  it('stores a reserved point with an empty sparse vector and no semantic fake', async () => {
    await store.writeContract(CONTRACT, 'generation-1');

    const [, args] = client.upsert.mock.calls[0] as [string, { points: Array<{ vector: unknown }> }];
    expect(args.points[0]!.vector).toEqual({ sparse: { indices: [], values: [] } });
  });

  it('reads a stored contract with retrieve and decodes its payload', async () => {
    client.retrieve.mockResolvedValue([
      {
        id: 'contract-id',
        payload: {
          kind: '__ia_contract__',
          ...CONTRACT,
          indexGeneration: 'generation-1',
          writtenAt: '2026-08-08T00:00:00.000Z',
        },
      },
    ]);

    const result = await store.readContract();

    expect(client.retrieve).toHaveBeenCalledWith('contracts', {
      ids: [expect.any(String)],
      with_payload: true,
    });
    expect(result).toEqual({
      kind: '__ia_contract__',
      ...CONTRACT,
      indexGeneration: 'generation-1',
      writtenAt: '2026-08-08T00:00:00.000Z',
    });
  });

  it('returns unknown when the reserved point is absent', async () => {
    client.retrieve.mockResolvedValue([]);

    await expect(store.readContract()).resolves.toBe('unknown');
  });

  it('returns unknown when retrieve returns no payload', async () => {
    client.retrieve.mockResolvedValue([{ id: 'contract-id', payload: null }]);

    await expect(store.readContract()).resolves.toBe('unknown');
  });

  it('refuses an unknown collection contract with collection and force remediation', async () => {
    client.retrieve.mockResolvedValue([]);

    const error = await store.assertSearchable(CONTRACT).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnknownContractError);
    expect((error as Error).message).toContain('contracts');
    expect((error as Error).message).toContain('ia index --force');
  });

  it('refuses a dimension mismatch and names active and persisted contracts', async () => {
    client.retrieve.mockResolvedValue([
      {
        payload: {
          kind: '__ia_contract__',
          ...CONTRACT,
          dimension: 4,
          indexGeneration: 'generation-1',
          writtenAt: '2026-08-08T00:00:00.000Z',
        },
      },
    ]);

    const error = await store.assertSearchable(CONTRACT).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EmbeddingContractMismatchError);
    expect((error as Error).message).toContain('active=');
    expect((error as Error).message).toContain('persisted=');
    expect((error as Error).message).toContain('ia index --force');
  });

  it('refuses a prefix-only mismatch', async () => {
    client.retrieve.mockResolvedValue([
      {
        payload: {
          kind: '__ia_contract__',
          ...CONTRACT,
          prefixes: { document: 'other: ', query: 'query: ' },
          indexGeneration: 'generation-1',
          writtenAt: '2026-08-08T00:00:00.000Z',
        },
      },
    ]);

    await expect(store.assertSearchable(CONTRACT)).rejects.toBeInstanceOf(
      EmbeddingContractMismatchError,
    );
  });

  it('refuses tokenizer and sparse hash version mismatches', async () => {
    client.retrieve.mockResolvedValue([
      {
        payload: {
          kind: '__ia_contract__',
          ...CONTRACT,
          tokenizerVersion: 2,
          sparseHashVersion: 2,
          indexGeneration: 'generation-1',
          writtenAt: '2026-08-08T00:00:00.000Z',
        },
      },
    ]);

    const error = await store.assertSearchable(CONTRACT).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EmbeddingContractMismatchError);
    expect((error as Error).message).toContain('tokenizerVersion');
    expect((error as Error).message).toContain('sparseHashVersion');
  });

  it('allows an exact contract match', async () => {
    client.retrieve.mockResolvedValue([
      {
        payload: {
          kind: '__ia_contract__',
          ...CONTRACT,
          indexGeneration: 'generation-1',
          writtenAt: '2026-08-08T00:00:00.000Z',
        },
      },
    ]);

    await expect(store.assertSearchable(CONTRACT)).resolves.toBeUndefined();
  });
});
