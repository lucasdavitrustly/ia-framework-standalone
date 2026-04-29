import { XMLParser } from 'fast-xml-parser';
import type { MavenModuleInfo, ModuleGraph, ModuleGraphJSON } from './types.js';

/**
 * Parses Maven POM files and builds a module dependency graph.
 */
export class MavenModuleParser {
  private readonly xmlParser: XMLParser;

  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: true,
      isArray: (name) => name === 'dependency' || name === 'module',
    });
  }

  /**
   * Parse a single pom.xml string into MavenModuleInfo.
   */
  parsePom(xmlContent: string, pomPath: string): MavenModuleInfo {
    const parsed = this.xmlParser.parse(xmlContent);
    const project = parsed.project ?? parsed;

    const parentGroupId = project.parent?.groupId as string | undefined;
    const parentVersion = project.parent?.version as string | undefined;

    const groupId = (project.groupId as string) ?? parentGroupId ?? '';
    const artifactId = (project.artifactId as string) ?? '';
    const version = (project.version as string) ?? parentVersion ?? '';

    const deps: string[] = [];
    const depsNode = project.dependencies?.dependency;
    if (Array.isArray(depsNode)) {
      for (const dep of depsNode) {
        if (dep.groupId && dep.artifactId) {
          deps.push(`${dep.groupId}:${dep.artifactId}`);
        }
      }
    }

    // Derive sourceRoot from pomPath
    const dir = pomPath.replace(/\/pom\.xml$/, '');
    const sourceRoot = dir === pomPath ? 'src/main/java' : `${dir}/src/main/java`;

    return {
      coordinate: { groupId, artifactId, version },
      moduleId: `${groupId}:${artifactId}`,
      dependencies: deps,
      interfaces: [],
      dtos: [],
      pomPath,
      sourceRoot,
    };
  }

  /**
   * Build a ModuleGraph from parsed module info.
   */
  buildModuleGraph(modules: MavenModuleInfo[]): ModuleGraph {
    const moduleMap = new Map<string, MavenModuleInfo>();
    for (const m of modules) {
      moduleMap.set(m.moduleId, m);
    }
    return createModuleGraph(moduleMap);
  }

  /**
   * Restore a ModuleGraph from cached JSON.
   */
  static fromJSON(json: ModuleGraphJSON): ModuleGraph {
    const moduleMap = new Map<string, MavenModuleInfo>();
    for (const [moduleId, info] of Object.entries(json.modules)) {
      moduleMap.set(moduleId, { ...info, moduleId });
    }
    return createModuleGraph(moduleMap);
  }
}

function createModuleGraph(modules: Map<string, MavenModuleInfo>): ModuleGraph {
  return {
    modules,

    getDirectDeps(moduleId: string): string[] {
      return modules.get(moduleId)?.dependencies ?? [];
    },

    getTransitiveDeps(moduleId: string, maxHops: number): string[] {
      const visited = new Set<string>();
      let frontier = new Set(modules.get(moduleId)?.dependencies ?? []);

      for (let hop = 0; hop < maxHops && frontier.size > 0; hop++) {
        const nextFrontier = new Set<string>();
        for (const depId of frontier) {
          if (!visited.has(depId)) {
            visited.add(depId);
            const depDeps = modules.get(depId)?.dependencies ?? [];
            for (const dd of depDeps) {
              if (!visited.has(dd)) {
                nextFrontier.add(dd);
              }
            }
          }
        }
        frontier = nextFrontier;
      }
      return [...visited];
    },

    toJSON(): ModuleGraphJSON {
      const result: ModuleGraphJSON = { version: 1, modules: {} };
      for (const [moduleId, info] of modules) {
        const { moduleId: _id, ...rest } = info;
        result.modules[moduleId] = rest;
      }
      return result;
    },
  };
}
