import type { CrossRepoEdgeStore } from './cross-repo-edges.js';
import { resolveImportToRepo } from './import-resolver.js';
/**
 * Minimal chunk shape needed by the edge builder (avoids cross-package dependency).
 */
export interface ChunkForEdgeBuilding {
  relativePath: string;
  name?: string | undefined;
  imports: string[];
  repoId?: string | undefined;
}

export interface EdgeBuilderEngine {
  /** Scroll all chunks for a repo (paginated) */
  scrollAllChunks(repoId: string, batchSize?: number): AsyncIterable<ChunkForEdgeBuilding[]>;
  /** Find chunk by exported symbol in a specific repo */
  scrollByNameInRepo(name: string, repoId: string): Promise<ChunkForEdgeBuilding[]>;
}

export interface EdgeBuilderConfig {
  repos: Array<{ name: string; provides?: string[] | undefined }>;
  /** If set, only rebuild edges for this repo (per D-10 — drop+rebuild affected edges) */
  rebuildRepoId?: string;
}

/**
 * Second pass: build cross-repo edges after all repos are indexed (per D-09).
 * Iterates chunks in source repo(s), resolves imports against other repos' provides,
 * looks up target symbol, stores edge.
 */
export async function buildCrossRepoEdges(
  store: CrossRepoEdgeStore,
  engine: EdgeBuilderEngine,
  config: EdgeBuilderConfig,
): Promise<{ edgesCreated: number; errors: number }> {
  let edgesCreated = 0;
  let errors = 0;

  // D-10: if rebuildRepoId provided, drop existing edges first
  if (config.rebuildRepoId) {
    store.rebuildForRepo(config.rebuildRepoId);
  }

  // Determine which repos to scan as source
  const sourceRepos = config.rebuildRepoId
    ? config.repos.filter((r) => r.name === config.rebuildRepoId)
    : config.repos;

  for (const sourceRepo of sourceRepos) {
    const pendingEdges: Array<{
      sourceRepo: string;
      sourcePath: string;
      sourceSymbol: string | null;
      targetRepo: string;
      targetPath: string | null;
      targetSymbol: string | null;
    }> = [];

    for await (const batch of engine.scrollAllChunks(sourceRepo.name)) {
      for (const chunk of batch) {
        for (const importSpec of chunk.imports) {
          // Resolve import to target repo (exclude self)
          const otherRepos = config.repos.filter((r) => r.name !== sourceRepo.name);
          const resolution = resolveImportToRepo(importSpec, otherRepos);
          if (!resolution) continue; // external package — skip silently

          // Extract symbol name from remaining path or use last segment
          const symbolName = resolution.remainingPath
            ? resolution.remainingPath.split('/').pop() || importSpec
            : importSpec.split('/').pop() || importSpec;

          // Look up target symbol in target repo
          const targets = await engine.scrollByNameInRepo(symbolName, resolution.targetRepo);
          if (targets.length === 0) continue;

          const target = targets[0]!;
          pendingEdges.push({
            sourceRepo: sourceRepo.name,
            sourcePath: chunk.relativePath,
            sourceSymbol: chunk.name || null,
            targetRepo: resolution.targetRepo,
            targetPath: target.relativePath ?? null,
            targetSymbol: target.name ?? null,
          });
        }
      }
    }

    if (pendingEdges.length > 0) {
      store.insertEdges(pendingEdges);
      edgesCreated += pendingEdges.length;
    }
  }

  return { edgesCreated, errors };
}
