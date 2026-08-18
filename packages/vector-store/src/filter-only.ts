import { FilterOnlyRetrievalError } from '@ia-framework/core';
import type { ChunkPayload } from './interface.js';

export const DEFAULT_FILTER_ONLY_CEILING = 10_000;

export interface FilterPoint {
  id: string;
  payload: ChunkPayload;
}

interface FilterOnlyClient {
  scroll(
    filter: Record<string, unknown>,
    limit: number,
    offset?: string | number,
  ): Promise<{ points: FilterPoint[]; nextOffset?: string | number | undefined }>;
  retrieve(ids: string[]): Promise<FilterPoint[]>;
  search?: (...args: unknown[]) => unknown;
}

export function orderDeterministically<T extends FilterPoint>(points: T[]): T[] {
  return [...points].sort((left, right) => {
    const repoCompare = (left.payload.repoId ?? '').localeCompare(right.payload.repoId ?? '');
    if (repoCompare !== 0) return repoCompare;
    const pathCompare = left.payload.relativePath.localeCompare(right.payload.relativePath);
    if (pathCompare !== 0) return pathCompare;
    return left.payload.startLine - right.payload.startLine || left.id.localeCompare(right.id);
  });
}

export class FilterOnlyRetriever {
  constructor(private readonly client: FilterOnlyClient) {}

  async scrollAll(
    filter: Record<string, unknown>,
    options: { ceiling: number } = { ceiling: DEFAULT_FILTER_ONLY_CEILING },
  ): Promise<{ points: FilterPoint[]; truncated: boolean }> {
    const points: FilterPoint[] = [];
    let offset: string | number | undefined;

    try {
      while (points.length < options.ceiling) {
        const remaining = options.ceiling - points.length;
        const page = await this.client.scroll(filter, remaining, offset);
        points.push(...page.points.slice(0, remaining));
        if (page.nextOffset === undefined || points.length >= options.ceiling) {
          return {
            points: orderDeterministically(points),
            truncated: page.nextOffset !== undefined && points.length >= options.ceiling,
          };
        }
        offset = page.nextOffset;
      }
    } catch (error) {
      throw new FilterOnlyRetrievalError(
        'unknown',
        'scrollAll',
        error instanceof Error ? error.message : String(error),
      );
    }

    return { points: orderDeterministically(points), truncated: false };
  }

  async retrieveByIds(ids: string[]): Promise<FilterPoint[]> {
    if (ids.length === 0) return [];
    try {
      return orderDeterministically(await this.client.retrieve(ids));
    } catch (error) {
      throw new FilterOnlyRetrievalError(
        'unknown',
        'retrieveByIds',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
