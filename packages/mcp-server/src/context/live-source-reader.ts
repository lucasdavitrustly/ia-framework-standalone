import { createHash } from 'node:crypto';

export interface LiveSourceCandidate {
  relativePath: string;
  startLine: number;
  endLine: number;
  repoId?: string;
  contentHash?: string;
}

export interface LiveSourceResult extends LiveSourceCandidate {
  content?: string;
  stale?: boolean;
  degraded?: 'read-failed';
  error?: string;
}

export type ReadWholeFile = (relativePath: string, repoId?: string) => Promise<string>;

export function validateRelativePath(relativePath: string): string {
  if (
    relativePath.length === 0 ||
    relativePath.startsWith('/') ||
    relativePath.startsWith('\\') ||
    /^[A-Za-z]:[\\/]/.test(relativePath) ||
    relativePath.split(/[\\/]/).includes('..')
  ) {
    throw new Error(`Path must be a safe relative path: ${relativePath}`);
  }
  return relativePath;
}

export class LiveSourceReader {
  constructor(private readonly readWholeFile: ReadWholeFile) {}

  async read(candidates: LiveSourceCandidate[]): Promise<LiveSourceResult[]> {
    const grouped = new Map<string, LiveSourceCandidate[]>();
    for (const candidate of candidates) {
      const key = `${candidate.repoId ?? ''}\0${candidate.relativePath}`;
      const group = grouped.get(key) ?? [];
      group.push(candidate);
      grouped.set(key, group);
    }

    const results = new Map<LiveSourceCandidate, LiveSourceResult>();
    await Promise.all(
      [...grouped.values()].map(async (group) => {
        const first = group[0]!;
        try {
          validateRelativePath(first.relativePath);
          const file = await this.readWholeFile(first.relativePath, first.repoId);
          for (const candidate of group) {
            const content = sliceLines(file, candidate.startLine, candidate.endLine);
            const stale = candidate.contentHash !== undefined && hash(content) !== candidate.contentHash;
            results.set(candidate, {
              ...candidate,
              content,
              ...(stale ? { stale: true } : {}),
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          for (const candidate of group) {
            results.set(candidate, { ...candidate, degraded: 'read-failed', error: message });
          }
        }
      }),
    );

    return candidates.map((candidate) => results.get(candidate)!);
  }
}

function sliceLines(file: string, startLine: number, endLine: number): string {
  return file.split('\n').slice(Math.max(0, startLine - 1), endLine).join('\n');
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
