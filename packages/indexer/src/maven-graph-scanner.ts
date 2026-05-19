import { MavenModuleParser } from '@ia-framework/core';
import type { ModuleGraphJSON } from '@ia-framework/core';

export interface MavenGraphScannerOptions {
  /** Absolute path to the target project root */
  targetProjectPath: string;
  /** File reader function (injectable for testing) */
  readFile: (path: string) => Promise<string>;
  /** Glob function to find pom.xml files (injectable for testing) */
  globPoms: (projectPath: string) => Promise<string[]>;
}

/**
 * Scan a project for Maven pom.xml files and build a module dependency graph.
 * Returns null if no pom.xml files found or all parsing fails.
 */
export async function scanMavenModuleGraph(
  options: MavenGraphScannerOptions,
): Promise<ModuleGraphJSON | null> {
  const { targetProjectPath, readFile, globPoms } = options;

  const pomPaths = await globPoms(targetProjectPath);
  if (pomPaths.length === 0) return null;

  const parser = new MavenModuleParser();
  const modules: Array<{ xml: string; path: string }> = [];

  for (const pomPath of pomPaths) {
    try {
      const xml = await readFile(pomPath);
      modules.push({ xml, path: pomPath });
    } catch {
      // Skip unreadable files
    }
  }

  if (modules.length === 0) return null;

  try {
    const parsedModules = modules.map((m) => parser.parsePom(m.xml, m.path));
    const graph = parser.buildModuleGraph(parsedModules);
    return graph.toJSON();
  } catch {
    return null;
  }
}
