import { QdrantClient } from '@qdrant/js-client-rest';
import { createHash } from 'node:crypto';
import type {
  VectorStore,
  VectorPoint,
  SearchOptions,
  SearchResult,
  CollectionInfo,
  ChunkPayload,
} from './interface.js';

/**
 * Convert a string chunk ID to a UUID-format string for Qdrant.
 * Qdrant requires UUID or uint64 point IDs.
 * Uses first 32 hex chars of sha256(input), formatted as UUID (8-4-4-4-12).
 */
function toQdrantId(chunkId: string): string {
  const hash = createHash('sha256').update(chunkId).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

export interface QdrantVectorStoreConfig {
  host: string;
  port: number;
  collectionName: string;
  apiKey?: string | undefined;
}

export class QdrantVectorStore implements VectorStore {
  private readonly client: QdrantClient;
  private readonly collectionName: string;

  constructor(config: QdrantVectorStoreConfig) {
    this.collectionName = config.collectionName;
    this.client = new QdrantClient({
      host: config.host,
      port: config.port,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    });
  }

  async initialize(config: { textDimensions: number; codeDimensions: number }): Promise<void> {
    const existence = await this.client.collectionExists(this.collectionName);
    if (existence.exists) return;

    await this.client.createCollection(this.collectionName, {
      vectors: {
        text: { size: config.textDimensions, distance: 'Cosine' },
        code: { size: config.codeDimensions, distance: 'Cosine' },
      },
    });
  }

  async upsertBatch(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;

    await this.client.upsert(this.collectionName, {
      wait: true,
      points: points.map((p) => ({
        id: toQdrantId(p.id),
        vector: {
          text: p.textVector,
          code: p.codeVector,
        },
        payload: { ...p.payload },
      })),
    });
  }

  async search(queryVector: number[], options: SearchOptions): Promise<SearchResult[]> {
    const results = await this.client.search(this.collectionName, {
      vector: { name: options.vectorName, vector: queryVector },
      limit: options.limit,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(options.scoreThreshold !== undefined ? { score_threshold: options.scoreThreshold } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(options.filter !== undefined ? { filter: options.filter as any } : {}),
      with_payload: true,
    });

    return results.map((r) => ({
      id: ((r.payload as unknown as ChunkPayload).chunkId) ?? String(r.id),
      score: r.score,
      payload: r.payload as unknown as ChunkPayload,
      vectorName: options.vectorName,
    }));
  }

  async getCollectionInfo(): Promise<CollectionInfo> {
    const info = await this.client.getCollection(this.collectionName);
    const vectors = info.config?.params?.vectors;

    let textDim = 0;
    let codeDim = 0;
    if (vectors && typeof vectors === 'object' && !Array.isArray(vectors)) {
      const namedVectors = vectors as Record<string, { size?: number }>;
      textDim = namedVectors['text']?.size ?? 0;
      codeDim = namedVectors['code']?.size ?? 0;
    }

    return {
      name: this.collectionName,
      pointCount: info.points_count ?? 0,
      vectorDimensions: { text: textDim, code: codeDim },
      status: String(info.status ?? 'unknown'),
    };
  }

  async deleteByFilter(filter: Record<string, unknown>): Promise<number> {
    // Use `as unknown as` to satisfy strict union type — Qdrant accepts FilterSelector shape
    const result = await (this.client.delete as unknown as (
      name: string,
      args: { wait: boolean; filter: Record<string, unknown> },
    ) => Promise<{ deleted_count?: number }>)(this.collectionName, {
      wait: true,
      filter,
    });
    return result.deleted_count ?? 0;
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    // Use `as unknown as` to satisfy strict union type — Qdrant accepts PointIdsList shape
    await (this.client.delete as unknown as (
      name: string,
      args: { wait: boolean; points: string[] },
    ) => Promise<void>)(this.collectionName, {
      wait: true,
      points: ids.map(toQdrantId),
    });
  }

  async deleteCollection(): Promise<void> {
    await this.client.deleteCollection(this.collectionName);
  }
}
