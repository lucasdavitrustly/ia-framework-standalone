import { createHash } from 'node:crypto';
import {
  EmbeddingContractMismatchError,
  UnknownContractError,
  contractsMatch,
  type EmbeddingContract,
} from '@ia-framework/core';

export interface StoredContract extends EmbeddingContract {
  kind: '__ia_contract__';
  indexGeneration: string;
  writtenAt: string;
}

interface ContractClient {
  retrieve(
    collectionName: string,
    options: { ids: string[]; with_payload: boolean },
  ): Promise<Array<{ id: string | number; payload?: unknown }>>;
  upsert(
    collectionName: string,
    options: { wait: boolean; points: Array<{ id: string; vector: unknown; payload: StoredContract }> },
  ): Promise<unknown>;
}

export const CONTRACT_POINT_ID = toContractId('__ia_embedding_contract__');

function toContractId(value: string): string {
  const hash = createHash('sha256').update(value).digest('hex');
  return [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join('-');
}

export class ContractStore {
  constructor(
    private readonly client: ContractClient,
    private readonly collectionName: string,
  ) {}

  async writeContract(contract: EmbeddingContract, indexGeneration: string): Promise<void> {
    const payload: StoredContract = {
      kind: '__ia_contract__',
      ...contract,
      indexGeneration,
      writtenAt: new Date().toISOString(),
    };
    await this.client.upsert(this.collectionName, {
      wait: true,
      points: [{ id: CONTRACT_POINT_ID, vector: { sparse: { indices: [], values: [] } }, payload }],
    });
  }

  async readContract(): Promise<StoredContract | 'unknown'> {
    const points = await this.client.retrieve(this.collectionName, {
      ids: [CONTRACT_POINT_ID],
      with_payload: true,
    });
    const payload = points[0]?.payload;
    if (!isStoredContract(payload)) return 'unknown';
    return payload;
  }

  async assertSearchable(active: EmbeddingContract): Promise<void> {
    const persisted = await this.readContract();
    if (persisted === 'unknown') throw new UnknownContractError(this.collectionName);

    const diff = contractsMatch(active, persisted);
    if (diff) {
      throw new EmbeddingContractMismatchError(this.collectionName, active, persisted);
    }
  }
}

function isStoredContract(value: unknown): value is StoredContract {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === '__ia_contract__' &&
    (record.provider === 'openai' || record.provider === 'ollama') &&
    typeof record.model === 'string' &&
    typeof record.dimension === 'number' &&
    typeof record.tokenizerVersion === 'number' &&
    typeof record.sparseHashVersion === 'number' &&
    typeof record.indexGeneration === 'string' &&
    typeof record.writtenAt === 'string'
  );
}
