import { resolve, basename } from 'node:path';
import type { ProjectConfig, RepoEntry } from '../types/index.js';
import { detectRepoProfile, detectRepoProvides } from './detector.js';

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * A resolved agent-docs injection target.
 * `indexed` is true for indexed repos (flagged repos[] or legacy target) and
 * false for extra `agentInjectionTargets` paths that are not part of the index.
 */
export interface InjectionTarget {
  path: string;
  name?: string | undefined;
  indexed: boolean;
}

export class RepoRegistry {
  private readonly entries: Map<string, RepoEntry>;
  private readonly extraInjectionTargets: string[];

  private constructor(entries: RepoEntry[], extraInjectionTargets: string[] = []) {
    this.entries = new Map(entries.map((e) => [e.name!, e]));
    this.extraInjectionTargets = extraInjectionTargets;
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
      // Legacy single target is implicitly opted-in for injection.
      rawEntries = [{ path: p, name: toKebabCase(basename(p)), injectAgents: true }];
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

    // Extra injection-only targets (US5) — resolved to absolute, never indexed.
    const extra = (config.agentInjectionTargets ?? []).map((p) => resolve(configDir, p));

    return new RepoRegistry(rawEntries, extra);
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
   * Resolve the set of agent-docs injection targets (US1/US3/US5).
   * - Indexed targets: repo entries flagged `injectAgents === true` (the legacy
   *   single target is synthesized as implicitly opted-in).
   * - Non-indexed targets: paths from `agentInjectionTargets` (already resolved
   *   to absolute in `fromConfig`).
   * De-duplicated by absolute path; a path present as both is returned once as indexed.
   */
  getInjectionTargets(): InjectionTarget[] {
    const byPath = new Map<string, InjectionTarget>();

    for (const entry of this.entries.values()) {
      if (entry.injectAgents === true) {
        byPath.set(entry.path, { path: entry.path, name: entry.name, indexed: true });
      }
    }

    for (const path of this.extraInjectionTargets) {
      // Do not downgrade an indexed target to non-indexed on collision.
      if (!byPath.has(path)) {
        byPath.set(path, { path, indexed: false });
      }
    }

    return [...byPath.values()];
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
      ...(entry.injectAgents !== undefined ? { injectAgents: entry.injectAgents } : {}),
    }));
  }
}
