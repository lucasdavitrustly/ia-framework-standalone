import { resolve, basename } from 'node:path';
import type { ProjectConfig, RepoEntry } from '../types/index.js';
import { detectRepoProfile, detectRepoProvides } from './detector.js';

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export class RepoRegistry {
  private readonly entries: Map<string, RepoEntry>;

  private constructor(entries: RepoEntry[]) {
    this.entries = new Map(entries.map((e) => [e.name!, e]));
  }

  static fromConfig(config: ProjectConfig, configDir: string): RepoRegistry {
    let rawEntries: RepoEntry[];

    if (config.repos && config.repos.length > 0) {
      rawEntries = config.repos.map((r) => ({
        ...r,
        path: resolve(configDir, r.path),
        name: r.name ?? toKebabCase(basename(r.path)),
      }));
    } else if (config.targetProjectPath) {
      const p = config.targetProjectPath;
      rawEntries = [{ path: p, name: toKebabCase(basename(p)) }];
    } else {
      throw new Error('Config must have either targetProjectPath or repos[]');
    }

    // Validate no duplicate names (D-15)
    const names = rawEntries.map((e) => e.name!);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) {
      throw new Error(
        `Duplicate repo names: ${[...new Set(dupes)].join(', ')}. Add explicit "name" to disambiguate.`,
      );
    }

    return new RepoRegistry(rawEntries as RepoEntry[]);
  }

  getRepos(): RepoEntry[] {
    return [...this.entries.values()];
  }

  getRepo(name: string): RepoEntry | undefined {
    return this.entries.get(name);
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Run per-repo detection for all entries.
   * Populates `profile` and `provides` fields on each RepoEntry.
   * Entries with non-existent paths are skipped gracefully (D-13).
   */
  async detect(): Promise<void> {
    for (const entry of this.entries.values()) {
      const profile = await detectRepoProfile(entry.path);
      if (profile) entry.profile = profile;
      const provides = await detectRepoProvides(entry.path);
      if (provides.length > 0) entry.provides = provides;
    }
  }

  /**
   * Serialize the registry back to project.json repos[] format (D-11).
   * Includes populated profile and provides fields.
   */
  toJSON(): RepoEntry[] {
    return [...this.entries.values()].map((entry) => ({
      path: entry.path,
      name: entry.name,
      ...(entry.provides !== undefined ? { provides: entry.provides } : {}),
      ...(entry.profile !== undefined ? { profile: entry.profile } : {}),
    }));
  }
}
