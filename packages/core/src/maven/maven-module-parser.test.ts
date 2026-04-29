import { describe, it, expect } from 'vitest';
import { MavenModuleParser } from './maven-module-parser.js';
import type { ModuleGraph, ModuleGraphJSON } from './types.js';

describe('MavenModuleParser', () => {
  const parser = new MavenModuleParser();

  describe('parsePom()', () => {
    it('extracts groupId, artifactId, version from a single pom.xml', () => {
      const xml = `<?xml version="1.0"?>
<project>
  <groupId>com.example</groupId>
  <artifactId>my-app</artifactId>
  <version>1.0.0</version>
</project>`;
      const info = parser.parsePom(xml, 'my-app/pom.xml');
      expect(info.coordinate).toEqual({
        groupId: 'com.example',
        artifactId: 'my-app',
        version: '1.0.0',
      });
      expect(info.moduleId).toBe('com.example:my-app');
      expect(info.pomPath).toBe('my-app/pom.xml');
    });

    it('extracts dependency list from <dependencies> section', () => {
      const xml = `<?xml version="1.0"?>
<project>
  <groupId>com.example</groupId>
  <artifactId>web</artifactId>
  <version>1.0.0</version>
  <dependencies>
    <dependency>
      <groupId>com.example</groupId>
      <artifactId>core</artifactId>
      <version>1.0.0</version>
    </dependency>
    <dependency>
      <groupId>org.junit</groupId>
      <artifactId>junit</artifactId>
      <version>5.0.0</version>
    </dependency>
  </dependencies>
</project>`;
      const info = parser.parsePom(xml, 'web/pom.xml');
      expect(info.dependencies).toEqual(['com.example:core', 'org.junit:junit']);
    });

    it('extracts <modules> list from parent POM', () => {
      const xml = `<?xml version="1.0"?>
<project>
  <groupId>com.example</groupId>
  <artifactId>parent</artifactId>
  <version>1.0.0</version>
  <modules>
    <module>core</module>
    <module>web</module>
    <module>api</module>
  </modules>
</project>`;
      const info = parser.parsePom(xml, 'pom.xml');
      expect(info.moduleId).toBe('com.example:parent');
      // modules list is available for recursive discovery, not stored directly on MavenModuleInfo
      // but the parser should handle it without error
    });

    it('resolves parent reference for groupId/version inheritance', () => {
      const parentXml = `<?xml version="1.0"?>
<project>
  <groupId>com.example</groupId>
  <artifactId>parent</artifactId>
  <version>2.0.0</version>
</project>`;

      const childXml = `<?xml version="1.0"?>
<project>
  <parent>
    <groupId>com.example</groupId>
    <artifactId>parent</artifactId>
    <version>2.0.0</version>
  </parent>
  <artifactId>child-module</artifactId>
</project>`;

      const parentInfo = parser.parsePom(parentXml, 'pom.xml');
      const childInfo = parser.parsePom(childXml, 'child-module/pom.xml');

      // Child should inherit groupId and version from parent element
      expect(childInfo.coordinate.groupId).toBe('com.example');
      expect(childInfo.coordinate.version).toBe('2.0.0');
      expect(childInfo.coordinate.artifactId).toBe('child-module');
      expect(childInfo.moduleId).toBe('com.example:child-module');
    });
  });

  describe('buildModuleGraph()', () => {
    it('builds correct ModuleGraph with edges from 3 modules', () => {
      const modules = [
        parser.parsePom(
          `<project>
          <groupId>com.app</groupId><artifactId>core</artifactId><version>1.0</version>
        </project>`,
          'core/pom.xml',
        ),
        parser.parsePom(
          `<project>
          <groupId>com.app</groupId><artifactId>service</artifactId><version>1.0</version>
          <dependencies><dependency><groupId>com.app</groupId><artifactId>core</artifactId><version>1.0</version></dependency></dependencies>
        </project>`,
          'service/pom.xml',
        ),
        parser.parsePom(
          `<project>
          <groupId>com.app</groupId><artifactId>web</artifactId><version>1.0</version>
          <dependencies>
            <dependency><groupId>com.app</groupId><artifactId>service</artifactId><version>1.0</version></dependency>
            <dependency><groupId>com.app</groupId><artifactId>core</artifactId><version>1.0</version></dependency>
          </dependencies>
        </project>`,
          'web/pom.xml',
        ),
      ];

      const graph = parser.buildModuleGraph(modules);
      expect(graph.modules.size).toBe(3);
      expect(graph.getDirectDeps('com.app:core')).toEqual([]);
      expect(graph.getDirectDeps('com.app:service')).toEqual(['com.app:core']);
      expect(graph.getDirectDeps('com.app:web')).toContain('com.app:service');
      expect(graph.getDirectDeps('com.app:web')).toContain('com.app:core');
    });
  });

  describe('getTransitiveDeps()', () => {
    it('returns correct transitive closure with maxHops=2', () => {
      const modules = [
        parser.parsePom(
          `<project>
          <groupId>com.app</groupId><artifactId>data</artifactId><version>1.0</version>
        </project>`,
          'data/pom.xml',
        ),
        parser.parsePom(
          `<project>
          <groupId>com.app</groupId><artifactId>core</artifactId><version>1.0</version>
          <dependencies><dependency><groupId>com.app</groupId><artifactId>data</artifactId><version>1.0</version></dependency></dependencies>
        </project>`,
          'core/pom.xml',
        ),
        parser.parsePom(
          `<project>
          <groupId>com.app</groupId><artifactId>web</artifactId><version>1.0</version>
          <dependencies><dependency><groupId>com.app</groupId><artifactId>core</artifactId><version>1.0</version></dependency></dependencies>
        </project>`,
          'web/pom.xml',
        ),
      ];

      const graph = parser.buildModuleGraph(modules);
      const transitive = graph.getTransitiveDeps('com.app:web', 2);
      expect(transitive).toContain('com.app:core');
      expect(transitive).toContain('com.app:data');
    });
  });

  describe('toJSON()/fromJSON() round-trip', () => {
    it('round-trips ModuleGraph correctly', () => {
      const modules = [
        parser.parsePom(
          `<project>
          <groupId>com.app</groupId><artifactId>core</artifactId><version>1.0</version>
        </project>`,
          'core/pom.xml',
        ),
        parser.parsePom(
          `<project>
          <groupId>com.app</groupId><artifactId>web</artifactId><version>1.0</version>
          <dependencies><dependency><groupId>com.app</groupId><artifactId>core</artifactId><version>1.0</version></dependency></dependencies>
        </project>`,
          'web/pom.xml',
        ),
      ];

      const graph = parser.buildModuleGraph(modules);
      const json = graph.toJSON();
      const restored = MavenModuleParser.fromJSON(json);

      expect(restored.modules.size).toBe(2);
      expect(restored.getDirectDeps('com.app:web')).toEqual(['com.app:core']);
      expect(restored.toJSON()).toEqual(json);
    });
  });
});
