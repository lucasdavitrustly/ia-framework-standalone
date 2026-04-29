/**
 * Maven coordinate — groupId:artifactId:version triple.
 */
export interface MavenCoordinate {
  groupId: string;
  artifactId: string;
  version: string;
}

/**
 * Information about a single Maven module extracted from its pom.xml.
 */
export interface MavenModuleInfo {
  coordinate: MavenCoordinate;
  /** Canonical moduleId: groupId:artifactId */
  moduleId: string;
  /** moduleIds of direct dependencies */
  dependencies: string[];
  /** Java type FQNs that cross module boundaries (populated by Plan 02) */
  interfaces: string[];
  /** Java type FQNs that are DTOs (populated by Plan 02) */
  dtos: string[];
  /** Relative path to this module's pom.xml */
  pomPath: string;
  /** Relative path to src/main/java */
  sourceRoot: string;
}

/**
 * Graph of Maven modules with dependency traversal methods.
 */
export interface ModuleGraph {
  modules: Map<string, MavenModuleInfo>;
  /** Get direct dependency moduleIds */
  getDirectDeps(moduleId: string): string[];
  /** Get transitive deps up to N hops */
  getTransitiveDeps(moduleId: string, maxHops: number): string[];
  /** Serialize for cache file */
  toJSON(): ModuleGraphJSON;
}

/**
 * Serializable representation of ModuleGraph for disk cache.
 */
export interface ModuleGraphJSON {
  version: 1;
  modules: Record<string, Omit<MavenModuleInfo, 'moduleId'>>;
}
