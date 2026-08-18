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
  SparseSearchOptions,
  SparseVector,
  StoreCapabilities,
} from './interface.js';
import { baseFilter } from './base-filter.js';
import {
  CollectionSchemaError,
  PayloadIndexError,
  type EmbeddingContract,
} from '@ia-framework/core';
import { ContractStore } from './contract-store.js';

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

function isReservedContractPoint(value: unknown): boolean {
  return isRecord(value) && value.kind === '__ia_contract__';
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
    docCommentStartLine:
      typeof record.docCommentStartLine === 'number' ? record.docCommentStartLine : undefined,
    annotationStartLine:
      typeof record.annotationStartLine === 'number' ? record.annotationStartLine : undefined,
    imports: Array.isArray(record.imports)
      ? record.imports.filter((v): v is string => typeof v === 'string')
      : [],
    exports: Array.isArray(record.exports)
      ? record.exports.filter((v): v is string => typeof v === 'string')
      : [],
    parentName: typeof record.parentName === 'string' ? record.parentName : undefined,
    parentStartLine:
      typeof record.parentStartLine === 'number' ? record.parentStartLine : undefined,
    parentEndLine: typeof record.parentEndLine === 'number' ? record.parentEndLine : undefined,
    partIndex: typeof record.partIndex === 'number' ? record.partIndex : undefined,
    totalParts: typeof record.totalParts === 'number' ? record.totalParts : undefined,
    truncated: typeof record.truncated === 'boolean' ? record.truncated : undefined,
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
          groupId: typeof record.mavenModule.groupId === 'string' ? record.mavenModule.groupId : '',
          artifactId:
            typeof record.mavenModule.artifactId === 'string' ? record.mavenModule.artifactId : '',
          version: typeof record.mavenModule.version === 'string' ? record.mavenModule.version : '',
        }
      : undefined,
    contentHash: typeof record.contentHash === 'string' ? record.contentHash : undefined,
    signature: typeof record.signature === 'string' ? record.signature : undefined,
    classSignature: typeof record.classSignature === 'string' ? record.classSignature : undefined,
    contextHeader: typeof record.contextHeader === 'string' ? record.contextHeader : undefined,
    moduleInfo: isRecord(record.moduleInfo)
      ? {
          group: typeof record.moduleInfo.group === 'string' ? record.moduleInfo.group : '',
          module: typeof record.moduleInfo.module === 'string' ? record.moduleInfo.module : '',
          submodule:
            typeof record.moduleInfo.submodule === 'string'
              ? record.moduleInfo.submodule
              : undefined,
        }
      : undefined,
    mavenCoordinates: isRecord(record.mavenCoordinates)
      ? {
          groupId:
            typeof record.mavenCoordinates.groupId === 'string'
              ? record.mavenCoordinates.groupId
              : '',
          artifactId:
            typeof record.mavenCoordinates.artifactId === 'string'
              ? record.mavenCoordinates.artifactId
              : '',
          version:
            typeof record.mavenCoordinates.version === 'string'
              ? record.mavenCoordinates.version
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
    calledBy: Array.isArray(record.calledBy)
      ? record.calledBy.filter((c: unknown): c is string => typeof c === 'string')
      : undefined,
    stereotype: typeof record.stereotype === 'string' ? record.stereotype : undefined,
    archLayer: typeof record.archLayer === 'string' ? record.archLayer : undefined,
    complexity: (['low', 'medium', 'high'] as const).includes(record.complexity as 'low')
      ? (record.complexity as 'low' | 'medium' | 'high')
      : undefined,
    annotationMeta: isRecord(record.annotationMeta)
      ? {
          operationSummaries: Array.isArray(record.annotationMeta.operationSummaries)
            ? record.annotationMeta.operationSummaries.filter(
                (v: unknown): v is string => typeof v === 'string',
              )
            : undefined,
          endpointPaths: Array.isArray(record.annotationMeta.endpointPaths)
            ? record.annotationMeta.endpointPaths.filter(
                (v: unknown): v is string => typeof v === 'string',
              )
            : undefined,
          httpMethods: Array.isArray(record.annotationMeta.httpMethods)
            ? record.annotationMeta.httpMethods.filter(
                (v: unknown): v is string => typeof v === 'string',
              )
            : undefined,
          tagName:
            typeof record.annotationMeta.tagName === 'string'
              ? record.annotationMeta.tagName
              : undefined,
        }
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
      ? (record.relationships as unknown[]).filter(isRecord).map((r) => ({
          target: typeof r.target === 'string' ? r.target : '',
          type: typeof r.type === 'string' ? r.type : '',
          label: typeof r.label === 'string' ? r.label : undefined,
        }))
      : undefined,
    dependencyEdges: Array.isArray(record.dependencyEdges)
      ? (record.dependencyEdges as unknown[]).filter(isRecord).map((e) => ({
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
    chunkIndex: typeof record.chunkIndex === 'number' ? record.chunkIndex : undefined,
    totalChunks: typeof record.totalChunks === 'number' ? record.totalChunks : undefined,
    signatureOnly: typeof record.signatureOnly === 'boolean' ? record.signatureOnly : undefined,
    tokenizerVersion:
      typeof record.tokenizerVersion === 'number' ? record.tokenizerVersion : undefined,
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

  async initialize(config: {
    textDimensions: number;
    codeDimensions: number;
    force?: boolean;
    embeddingContract?: EmbeddingContract;
    indexGeneration?: string;
  }): Promise<void> {
    const semanticDimensions = config.textDimensions;
    const signatureDimensions = config.codeDimensions;
    const contractStore = new ContractStore(
      this.client as unknown as ConstructorParameters<typeof ContractStore>[0],
      this.collectionName,
    );
    const indexFields: Array<{ field_name: string; field_schema: 'keyword' | 'integer' }> = [
      { field_name: 'stereotype', field_schema: 'keyword' },
      { field_name: 'archLayer', field_schema: 'keyword' },
      { field_name: 'moduleInfo.module', field_schema: 'keyword' },
      { field_name: 'language', field_schema: 'keyword' },
      { field_name: 'repoId', field_schema: 'keyword' },
      { field_name: 'relativePath', field_schema: 'keyword' },
      { field_name: 'kind', field_schema: 'keyword' },
      { field_name: 'chunkIndex', field_schema: 'integer' },
      { field_name: 'defines', field_schema: 'keyword' },
      { field_name: 'dependencyEdges[].targetPath', field_schema: 'keyword' },
      { field_name: 'dependencyEdges[].relation', field_schema: 'keyword' },
    ];
    const reconcilePayloadIndexes = async (): Promise<void> => {
      for (const idx of indexFields) {
        try {
          await this.client.createPayloadIndex(this.collectionName, idx);
        } catch (error) {
          throw new PayloadIndexError(
            idx.field_name,
            `${error instanceof Error ? error.message : String(error)}; filtering may fall back to an unindexed full scan`,
          );
        }
      }
    };
    const writeContract = async (): Promise<void> => {
      if (!config.embeddingContract) return;
      await contractStore.writeContract(
        config.embeddingContract,
        config.indexGeneration ?? 'unknown',
      );
    };

    const existence = await this.client.collectionExists(this.collectionName);
    if (existence.exists) {
      const info = await this.client.getCollection(this.collectionName);
      const vectors = (info.config?.params?.vectors ?? {}) as Record<string, unknown>;

      if (hasOldSchema(vectors)) {
        if (config.force) {
          // --force: silently delete and fall through to recreation
          await this.client.deleteCollection(this.collectionName);
        } else {
          throw new Error(
            `[OLD_SCHEMA] Collection "${this.collectionName}" uses old vector schema (text/code). ` +
              `Run "ia-framework index --force" to recreate with the new 3-vector schema (semantic/signature/sparse). ` +
              `Warning: existing index data will be deleted.`,
          );
        }
      } else {
        const semanticSize =
          'semantic' in vectors && isRecord(vectors['semantic'])
            ? (vectors['semantic'] as { size?: number }).size
            : undefined;
        const signatureSize =
          'signature' in vectors && isRecord(vectors['signature'])
            ? (vectors['signature'] as { size?: number }).size
            : undefined;
        const unreadable = semanticSize === undefined || signatureSize === undefined;
        const mismatch =
          unreadable ||
          semanticSize !== semanticDimensions ||
          signatureSize !== signatureDimensions;
        if (mismatch) {
          if (!config.force) {
            throw new CollectionSchemaError(
              this.collectionName,
              unreadable ? 'vectors' : 'semantic/signature',
              semanticDimensions,
              unreadable ? 'unreadable' : `${semanticSize}/${signatureSize}`,
            );
          }
          await this.client.deleteCollection(this.collectionName);
        } else if (config.embeddingContract) {
          await contractStore.assertSearchable(config.embeddingContract);
          await reconcilePayloadIndexes();
          return;
        } else {
          await reconcilePayloadIndexes();
          return;
        }
      }
    }

    await this.client.createCollection(this.collectionName, {
      vectors: {
        semantic: { size: semanticDimensions, distance: 'Cosine' },
        signature: { size: signatureDimensions, distance: 'Cosine' },
      },
      sparse_vectors: { sparse: { modifier: 'idf' } },
    });

    await writeContract();
    await reconcilePayloadIndexes();
  }

  async upsertBatch(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;
    await this.client.upsert(this.collectionName, {
      wait: true,
      points: points.map((p) => {
        const semanticVec = p.semantic ?? p.textVector ?? [];
        const signatureVec = p.signature ?? p.codeVector ?? [];
        const sparseVec = p.sparse ?? p.sparseVector;
        // Lean-payload constraint: content is never stored in Qdrant.
        const leanPayload: Record<string, unknown> = { ...p.payload };
        delete leanPayload['content'];
        return {
          id: toQdrantId(p.id),
          vector: {
            semantic: semanticVec,
            signature: signatureVec,
            ...(sparseVec ? { sparse: sparseVec } : {}),
          },
          payload: leanPayload,
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
    const response = await this.client.query(this.collectionName, {
      query: queryVector,
      using: vectorName,
      limit: options.limit,
      ...(options.scoreThreshold !== undefined ? { score_threshold: options.scoreThreshold } : {}),
      filter: baseFilter(options.filter),
      with_payload: true,
    });
    const results = response.points;
    return results
      .filter((r) => !isReservedContractPoint(r.payload))
      .map((r) => ({
        id: toChunkPayload(r.payload).chunkId || String(r.id),
        score: r.score,
        payload: toChunkPayload(r.payload),
        vectorName: vectorName as 'semantic' | 'signature',
      }));
  }

  async searchSparse(vector: SparseVector, options: SparseSearchOptions): Promise<SearchResult[]> {
    const response = await this.client.query(this.collectionName, {
      query: vector,
      using: 'sparse',
      limit: options.limit,
      filter: baseFilter(options.filter),
      with_payload: true,
    });
    const results = response.points;

    return results
      .filter((result) => !isReservedContractPoint(result.payload))
      .sort(
        (left, right) =>
          right.score - left.score || String(left.id).localeCompare(String(right.id)),
      )
      .map((result) => ({
        id: toChunkPayload(result.payload).chunkId || String(result.id),
        score: result.score,
        payload: toChunkPayload(result.payload),
        vectorName: 'sparse' as const,
      }));
  }

  capabilities(): StoreCapabilities {
    return {
      sparse: true,
      filterOnly: false,
      payloadIndexes: [],
    };
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
          query: { nearest: options.semanticVector },
          using: 'semantic',
          limit: options.limit * semanticMult,
        },
        {
          query: { nearest: options.signatureVector },
          using: 'signature',
          limit: options.limit * semanticMult,
        },
        ...(options.sparseVector
          ? [
              {
                query: { nearest: options.sparseVector },
                using: 'sparse',
                limit: options.limit * keywordMult,
              },
            ]
          : []),
      ],
      query: { fusion: 'rrf' },
      limit: options.limit,
      with_payload: true,
      filter: baseFilter(options.filter),
    });
    const points = Array.isArray(results)
      ? results
      : isRecord(results) && Array.isArray(results.points)
        ? results.points
        : [];
    return points
      .filter((r) => isRecord(r) && !isReservedContractPoint(r.payload))
      .map((r) => {
        const branch = isRecord(r) ? (r.vectorName ?? r.vector_name) : undefined;
        const vectorName =
          branch === 'signature' || branch === 'sparse' || branch === 'text' || branch === 'code'
            ? branch
            : 'semantic';
        return {
          id: isRecord(r) ? toChunkPayload(r.payload).chunkId || String(r.id) : '',
          score: isRecord(r) && typeof r.score === 'number' ? r.score : 0,
          payload: isRecord(r) ? toChunkPayload(r.payload) : toChunkPayload(undefined),
          vectorName,
        };
      });
  }

  async deleteByFilter(filter: Record<string, unknown>): Promise<number> {
    // Qdrant's delete operation acknowledges completion but does not expose a
    // deleted-count field. Count first so callers can report real invalidation
    // metrics while retaining wait=true deletion semantics.
    const deleted = await this.countPoints(filter);
    await (
      this.client.delete as unknown as (
        name: string,
        args: { wait: boolean; filter: Record<string, unknown> },
      ) => Promise<unknown>
    )(this.collectionName, { wait: true, filter });
    return deleted;
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
      filter: baseFilter(options.filter),
      with_payload: true,
    });
    return {
      points: result.points
        .filter((p) => !isReservedContractPoint(p.payload))
        .map((p) => ({ id: String(p.id), payload: toChunkPayload(p.payload) })),
      nextOffset:
        typeof result.next_page_offset === 'string' || typeof result.next_page_offset === 'number'
          ? result.next_page_offset
          : undefined,
    };
  }

  async countPoints(filter?: Record<string, unknown>): Promise<number> {
    const result = await this.client.count(this.collectionName, {
      filter: baseFilter(filter),
      exact: true,
    });
    return result.count;
  }
}
