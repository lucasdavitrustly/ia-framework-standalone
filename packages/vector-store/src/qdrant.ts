import { QdrantClient } from '@qdrant/js-client-rest';
import { createHash } from 'node:crypto';
import type {
  VectorStore,
  VectorPoint,
  SearchOptions,
  SearchResult,
  CollectionInfo,
  ChunkPayload,
  HybridSearchOptions,
} from './interface.js';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toChunkPayload(value: unknown): ChunkPayload {
  const record = isRecord(value) ? value : {};
  return {
    chunkId: typeof record.chunkId === 'string' ? record.chunkId : '',
    filePath: typeof record.filePath === 'string' ? record.filePath : '',
    relativePath: typeof record.relativePath === 'string' ? record.relativePath : '',
    language: typeof record.language === 'string' ? record.language : '',
    chunkType: typeof record.chunkType === 'string' ? record.chunkType : '',
    name: typeof record.name === 'string' ? record.name : undefined,
    content: typeof record.content === 'string' ? record.content : undefined,
    startLine: typeof record.startLine === 'number' ? record.startLine : 0,
    endLine: typeof record.endLine === 'number' ? record.endLine : 0,
    imports: Array.isArray(record.imports)
      ? record.imports.filter((v): v is string => typeof v === 'string')
      : [],
    exports: Array.isArray(record.exports)
      ? record.exports.filter((v): v is string => typeof v === 'string')
      : [],
    parentName: typeof record.parentName === 'string' ? record.parentName : undefined,
    superclass: typeof record.superclass === 'string' ? record.superclass : undefined,
    interfaces: Array.isArray(record.interfaces)
      ? record.interfaces.filter((i: unknown) => typeof i === 'string')
      : undefined,
    isInnerClass: typeof record.isInnerClass === 'boolean' ? record.isInnerClass : undefined,
    modulePath: typeof record.modulePath === 'string' ? record.modulePath : undefined,
    packageName: typeof record.packageName === 'string' ? record.packageName : undefined,
    layerHints: Array.isArray(record.layerHints)
      ? record.layerHints.filter((v): v is string => typeof v === 'string')
      : undefined,
    repoId: typeof record.repoId === 'string' ? record.repoId : undefined,
    indexedAt: typeof record.indexedAt === 'string' ? record.indexedAt : new Date(0).toISOString(),
    qualityScore: typeof record.qualityScore === 'number' ? record.qualityScore : undefined,
    mavenModule: isRecord(record.mavenModule)
      ? {
          groupId:
            typeof (record.mavenModule as Record<string, unknown>).groupId === 'string'
              ? ((record.mavenModule as Record<string, unknown>).groupId as string)
              : '',
          artifactId:
            typeof (record.mavenModule as Record<string, unknown>).artifactId === 'string'
              ? ((record.mavenModule as Record<string, unknown>).artifactId as string)
              : '',
          version:
            typeof (record.mavenModule as Record<string, unknown>).version === 'string'
              ? ((record.mavenModule as Record<string, unknown>).version as string)
              : '',
        }
      : undefined,
    contentHash: typeof record.contentHash === 'string' ? record.contentHash : undefined,
    signature: typeof record.signature === 'string' ? record.signature : undefined,
    classSignature: typeof record.classSignature === 'string' ? record.classSignature : undefined,
    contextHeader: typeof record.contextHeader === 'string' ? record.contextHeader : undefined,
    moduleInfo: isRecord(record.moduleInfo)
      ? {
          group:
            typeof (record.moduleInfo as Record<string, unknown>).group === 'string'
              ? ((record.moduleInfo as Record<string, unknown>).group as string)
              : '',
          module:
            typeof (record.moduleInfo as Record<string, unknown>).module === 'string'
              ? ((record.moduleInfo as Record<string, unknown>).module as string)
              : '',
          submodule:
            typeof (record.moduleInfo as Record<string, unknown>).submodule === 'string'
              ? ((record.moduleInfo as Record<string, unknown>).submodule as string)
              : undefined,
        }
      : undefined,
    mavenCoordinates: isRecord(record.mavenCoordinates)
      ? {
          groupId:
            typeof (record.mavenCoordinates as Record<string, unknown>).groupId === 'string'
              ? ((record.mavenCoordinates as Record<string, unknown>).groupId as string)
              : '',
          artifactId:
            typeof (record.mavenCoordinates as Record<string, unknown>).artifactId === 'string'
              ? ((record.mavenCoordinates as Record<string, unknown>).artifactId as string)
              : '',
          version:
            typeof (record.mavenCoordinates as Record<string, unknown>).version === 'string'
              ? ((record.mavenCoordinates as Record<string, unknown>).version as string)
              : '',
        }
      : undefined,
    visibility: (['public', 'protected', 'package', 'private'] as const).includes(
      record.visibility as 'public',
    )
      ? (record.visibility as 'public' | 'protected' | 'package' | 'private')
      : undefined,
    annotations: Array.isArray(record.annotations)
      ? record.annotations.filter((a: unknown): a is string => typeof a === 'string')
      : undefined,
    defines: Array.isArray(record.defines)
      ? record.defines.filter((d: unknown): d is string => typeof d === 'string')
      : undefined,
    calls: Array.isArray(record.calls)
      ? record.calls.filter((c: unknown): c is string => typeof c === 'string')
      : undefined,
    stereotype: typeof record.stereotype === 'string' ? record.stereotype : undefined,
    archLayer: typeof record.archLayer === 'string' ? record.archLayer : undefined,
    complexity: (['low', 'medium', 'high'] as const).includes(record.complexity as 'low')
      ? (record.complexity as 'low' | 'medium' | 'high')
      : undefined,
    description: typeof record.description === 'string' ? record.description : undefined,
    businessContext:
      typeof record.businessContext === 'string' ? record.businessContext : undefined,
    serviceBoundary:
      typeof record.serviceBoundary === 'string' ? record.serviceBoundary : undefined,
    semanticTags: Array.isArray(record.semanticTags)
      ? record.semanticTags.filter((t: unknown): t is string => typeof t === 'string')
      : undefined,
    relationships: Array.isArray(record.relationships)
      ? (record.relationships as unknown[])
          .filter(isRecord)
          .map((r) => ({
            target: typeof r.target === 'string' ? r.target : '',
            type: typeof r.type === 'string' ? r.type : '',
            label: typeof r.label === 'string' ? r.label : undefined,
          }))
      : undefined,
    dependencyEdges: Array.isArray(record.dependencyEdges)
      ? (record.dependencyEdges as unknown[])
          .filter(isRecord)
          .map((e) => ({
            targetPath: typeof e.targetPath === 'string' ? e.targetPath : '',
            relation: typeof e.relation === 'string' ? e.relation : '',
            symbols: Array.isArray(e.symbols)
              ? (e.symbols as unknown[]).filter((s): s is string => typeof s === 'string')
              : undefined,
          }))
      : undefined,
    enrichedAt: typeof record.enrichedAt === 'string' ? record.enrichedAt : undefined,
    enrichmentModel:
      typeof record.enrichmentModel === 'string' ? record.enrichmentModel : undefined,
  };
}

export interface QdrantVectorStoreConfig {
  host: string;
  port: number;
  collectionName: string;
  apiKey?: string | undefined;
}

function hasOldSchema(vectors: Record<string, unknown>): boolean {
  return 'text' in vectors || 'code' in vectors;
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
    const semanticDimensions = config.textDimensions;
    const signatureDimensions = config.codeDimensions;

    const existence = await this.client.collectionExists(this.collectionName);
    if (existence.exists) {
      const info = await this.client.getCollection(this.collectionName);
      const vectors = (info.config?.params?.vectors ?? {}) as Record<string, unknown>;

      if (hasOldSchema(vectors)) {
        throw new Error(
          `[OLD_SCHEMA] Collection "${this.collectionName}" uses old vector schema (text/code). ` +
            `Run "ia-framework index --force" to recreate with the new 3-vector schema (semantic/signature/sparse). ` +
            `Warning: existing index data will be deleted.`,
        );
      }

      const semanticSize =
        'semantic' in vectors && isRecord(vectors['semantic'])
          ? (vectors['semantic'] as { size?: number }).size
          : undefined;
      const signatureSize =
        'signature' in vectors && isRecord(vectors['signature'])
          ? (vectors['signature'] as { size?: number }).size
          : undefined;
      const mismatch =
        (semanticSize !== undefined && semanticSize !== semanticDimensions) ||
        (signatureSize !== undefined && signatureSize !== signatureDimensions);
      if (!mismatch) return;
      await this.client.deleteCollection(this.collectionName);
    }

    await this.client.createCollection(this.collectionName, {
      vectors: {
        semantic: { size: semanticDimensions, distance: 'Cosine' },
        signature: { size: signatureDimensions, distance: 'Cosine' },
      },
      sparse_vectors: { sparse: { modifier: 'idf' } },
    });

    const indexFields: Array<{ field_name: string; field_schema: 'keyword' | 'integer' }> = [
      { field_name: 'stereotype', field_schema: 'keyword' },
      { field_name: 'archLayer', field_schema: 'keyword' },
      { field_name: 'moduleInfo.module', field_schema: 'keyword' },
      { field_name: 'language', field_schema: 'keyword' },
      { field_name: 'repoId', field_schema: 'keyword' },
      { field_name: 'relativePath', field_schema: 'keyword' },
    ];
    for (const idx of indexFields) {
      try {
        await this.client.createPayloadIndex(this.collectionName, idx);
      } catch {
        /* non-fatal */
      }
    }
  }

  async upsertBatch(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;
    await this.client.upsert(this.collectionName, {
      wait: true,
      points: points.map((p) => {
        const semanticVec = p.semantic ?? p.textVector ?? [];
        const signatureVec = p.signature ?? p.codeVector ?? [];
        const sparseVec = p.sparse ?? p.sparseVector;
        return {
          id: toQdrantId(p.id),
          vector: {
            semantic: semanticVec,
            signature: signatureVec,
            ...(sparseVec ? { sparse: sparseVec } : {}),
          },
          payload: { ...p.payload },
        };
      }),
    });
  }

  async search(queryVector: number[], options: SearchOptions): Promise<SearchResult[]> {
    const vectorName =
      options.vectorName === 'text'
        ? 'semantic'
        : options.vectorName === 'code'
          ? 'signature'
          : options.vectorName;
    const results = await this.client.search(this.collectionName, {
      vector: { name: vectorName, vector: queryVector },
      limit: options.limit,
      ...(options.scoreThreshold !== undefined ? { score_threshold: options.scoreThreshold } : {}),
      ...(options.filter !== undefined ? { filter: options.filter } : {}),
      with_payload: true,
    });
    return results.map((r) => ({
      id: toChunkPayload(r.payload).chunkId || String(r.id),
      score: r.score,
      payload: toChunkPayload(r.payload),
      vectorName: vectorName as 'semantic' | 'signature',
    }));
  }

  async getCollectionInfo(): Promise<CollectionInfo> {
    const info = await this.client.getCollection(this.collectionName);
    const vectors = (info.config?.params?.vectors ?? {}) as Record<string, unknown>;
    let textDim = 0,
      codeDim = 0,
      semanticDim = 0,
      signatureDim = 0;
    if ('text' in vectors && isRecord(vectors['text']))
      textDim = (vectors['text'] as { size?: number }).size ?? 0;
    if ('code' in vectors && isRecord(vectors['code']))
      codeDim = (vectors['code'] as { size?: number }).size ?? 0;
    if ('semantic' in vectors && isRecord(vectors['semantic']))
      semanticDim = (vectors['semantic'] as { size?: number }).size ?? 0;
    if ('signature' in vectors && isRecord(vectors['signature']))
      signatureDim = (vectors['signature'] as { size?: number }).size ?? 0;
    const sparseVectors = (info.config?.params as Record<string, unknown> | undefined)
      ?.sparse_vectors;
    const hasSparseVector =
      sparseVectors != null && typeof sparseVectors === 'object' && 'sparse' in sparseVectors;
    const newSchema = !hasOldSchema(vectors) && ('semantic' in vectors || 'signature' in vectors);
    return {
      name: this.collectionName,
      pointCount: info.points_count ?? 0,
      vectorDimensions: {
        text: textDim || semanticDim,
        code: codeDim || signatureDim,
        ...(semanticDim > 0 ? { semantic: semanticDim } : {}),
        ...(signatureDim > 0 ? { signature: signatureDim } : {}),
      },
      status: String(info.status ?? 'unknown'),
      hasSparseVector,
      isNewSchema: newSchema,
    };
  }

  async searchHybrid(options: HybridSearchOptions): Promise<SearchResult[]> {
    const query = this.client.query.bind(this.client) as (
      collectionName: string,
      request: Record<string, unknown>,
    ) => Promise<unknown>;
    const semanticMult = options.semanticPrefetchMultiplier ?? 3;
    const keywordMult = options.keywordPrefetchMultiplier ?? 3;
    const results = await query(this.collectionName, {
      prefetch: [
        {
          query: { nearest: options.denseVector },
          using: 'semantic',
          limit: options.limit * semanticMult,
        },
        {
          query: { nearest: options.denseVector },
          using: 'signature',
          limit: options.limit * semanticMult,
        },
        {
          query: { nearest: options.sparseVector },
          using: 'sparse',
          limit: options.limit * keywordMult,
        },
      ],
      query: { fusion: 'rrf' },
      limit: options.limit,
      with_payload: true,
      ...(options.filter !== undefined ? { filter: options.filter } : {}),
    });
    const points = Array.isArray(results)
      ? results
      : isRecord(results) && Array.isArray(results.points)
        ? results.points
        : [];
    return points.map((r) => ({
      id: isRecord(r) ? toChunkPayload(r.payload).chunkId || String(r.id) : '',
      score: isRecord(r) && typeof r.score === 'number' ? r.score : 0,
      payload: isRecord(r) ? toChunkPayload(r.payload) : toChunkPayload(undefined),
      vectorName: 'semantic' as const,
    }));
  }

  async deleteByFilter(filter: Record<string, unknown>): Promise<number> {
    const result = await (
      this.client.delete as unknown as (
        name: string,
        args: { wait: boolean; filter: Record<string, unknown> },
      ) => Promise<{ deleted_count?: number }>
    )(this.collectionName, { wait: true, filter });
    return result.deleted_count ?? 0;
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await (
      this.client.delete as unknown as (
        name: string,
        args: { wait: boolean; points: string[] },
      ) => Promise<void>
    )(this.collectionName, { wait: true, points: ids.map(toQdrantId) });
  }

  async deleteCollection(): Promise<void> {
    await this.client.deleteCollection(this.collectionName);
  }

  async scroll(options: {
    limit: number;
    offset?: string | number | undefined;
    filter?: Record<string, unknown> | undefined;
  }): Promise<{
    points: Array<{ id: string; payload: ChunkPayload }>;
    nextOffset?: string | number | undefined;
  }> {
    const result = await this.client.scroll(this.collectionName, {
      limit: options.limit,
      ...(options.offset !== undefined ? { offset: options.offset } : {}),
      ...(options.filter !== undefined ? { filter: options.filter } : {}),
      with_payload: true,
    });
    return {
      points: result.points.map((p) => ({ id: String(p.id), payload: toChunkPayload(p.payload) })),
      nextOffset:
        typeof result.next_page_offset === 'string' || typeof result.next_page_offset === 'number'
          ? result.next_page_offset
          : undefined,
    };
  }

  async countPoints(filter?: Record<string, unknown>): Promise<number> {
    const result = await this.client.count(this.collectionName, {
      ...(filter !== undefined ? { filter } : {}),
      exact: true,
    });
    return result.count;
  }
}
