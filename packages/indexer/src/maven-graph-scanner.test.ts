import { describe, it, expect, vi } from 'vitest';
import { scanMavenModuleGraph } from './maven-graph-scanner.js';

describe('scanMavenModuleGraph', () => {
  it('discovers pom.xml files and builds a module graph JSON', async () => {
    const mockReadFile = vi.fn();
    // Root pom
    mockReadFile.mockImplementation((path: string): Promise<string> => {
      if (path.includes('pom.xml') && !path.includes('module-a')) {
        return Promise.resolve(`<?xml version="1.0"?>
<project>
  <groupId>com.example</groupId>
  <artifactId>parent</artifactId>
  <version>1.0.0</version>
  <modules>
    <module>module-a</module>
  </modules>
</project>`);
      }
      if (path.includes('module-a/pom.xml')) {
        return Promise.resolve(`<?xml version="1.0"?>
<project>
  <parent>
    <groupId>com.example</groupId>
    <version>1.0.0</version>
  </parent>
  <artifactId>module-a</artifactId>
  <dependencies>
    <dependency>
      <groupId>com.example</groupId>
      <artifactId>parent</artifactId>
    </dependency>
  </dependencies>
</project>`);
      }
      return Promise.reject(new Error(`File not found: ${path}`));
    });

    const mockGlob = vi.fn().mockResolvedValue(['/project/pom.xml', '/project/module-a/pom.xml']);

    const result = await scanMavenModuleGraph({
      targetProjectPath: '/project',
      readFile: mockReadFile,
      globPoms: mockGlob,
    });

    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(Object.keys(result!.modules).length).toBe(2);
    expect(result!.modules['com.example:parent']).toBeDefined();
    expect(result!.modules['com.example:module-a']).toBeDefined();
  });

  it('returns null when no pom.xml files found', async () => {
    const mockGlob = vi.fn().mockResolvedValue([]);

    const result = await scanMavenModuleGraph({
      targetProjectPath: '/project',
      readFile: vi.fn(),
      globPoms: mockGlob,
    });

    expect(result).toBeNull();
  });

  it('handles parse errors gracefully and skips broken pom files', async () => {
    const mockReadFile = vi.fn().mockResolvedValue('not valid xml <<<<');
    const mockGlob = vi.fn().mockResolvedValue(['/project/pom.xml']);

    const result = await scanMavenModuleGraph({
      targetProjectPath: '/project',
      readFile: mockReadFile,
      globPoms: mockGlob,
    });

    // Should return null or empty graph, not throw
    expect(result).toBeNull();
  });
});
