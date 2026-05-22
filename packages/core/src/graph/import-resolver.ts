export interface ImportResolution {
  targetRepo: string;
  matchedPrefix: string;
  remainingPath: string;
}

/**
 * Resolve an import specifier to a target repo using provides prefix matching.
 * Returns null if no repo provides the import.
 * If multiple repos match, returns the one with the longest matching prefix.
 */
export function resolveImportToRepo(
  importSpecifier: string,
  repos: Array<{ name: string; provides?: string[] | undefined }>,
): ImportResolution | null {
  let best: ImportResolution | null = null;
  for (const repo of repos) {
    if (!repo.provides) continue;
    for (const prefix of repo.provides) {
      if (importSpecifier === prefix || importSpecifier.startsWith(prefix + '/')) {
        if (!best || prefix.length > best.matchedPrefix.length) {
          best = {
            targetRepo: repo.name,
            matchedPrefix: prefix,
            remainingPath: importSpecifier.slice(prefix.length).replace(/^\//, ''),
          };
        }
      }
    }
  }
  return best;
}
