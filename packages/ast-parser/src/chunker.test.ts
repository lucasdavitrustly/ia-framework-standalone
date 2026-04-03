import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseFile } from './chunker.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `ast-parser-test-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function makeFile(name: string, content: string): Promise<string> {
  const filePath = join(tmpDir, name);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

describe('parseFile', () => {
  it('detects function declarations with correct chunkType and name', async () => {
    const filePath = await makeFile('index.ts', `
export function greet(name: string): string {
  return \`Hello \${name}\`;
}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const fn = chunks.find((c) => c.chunkType === 'function');
    expect(fn).toBeDefined();
    expect(fn!.name).toBe('greet');
  });

  it('detects class declarations with correct chunkType and name', async () => {
    const filePath = await makeFile('class.ts', `
export class UserService {
  private users: string[] = [];

  addUser(name: string): void {
    this.users.push(name);
  }
}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class');
    expect(cls).toBeDefined();
    expect(cls!.name).toBe('UserService');
  });

  it('detects interface declarations with correct chunkType', async () => {
    const filePath = await makeFile('interface.ts', `
export interface User {
  id: string;
  name: string;
  email?: string;
}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const iface = chunks.find((c) => c.chunkType === 'interface');
    expect(iface).toBeDefined();
    expect(iface!.name).toBe('User');
  });

  it('extracts imports from a file with import statements', async () => {
    const filePath = await makeFile('with-imports.ts', `
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function loadFile(path: string): Promise<string> {
  return readFile(join(path), 'utf-8');
}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // All chunks should have the file's imports
    const withImports = chunks.filter((c) => c.imports.length > 0);
    expect(withImports.length).toBeGreaterThan(0);
    const allImports = withImports.flatMap((c) => c.imports);
    expect(allImports).toContain('node:fs/promises');
    expect(allImports).toContain('node:path');
  });

  it('returns a single module chunk for a file with only imports', async () => {
    const filePath = await makeFile('imports-only.ts', `
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.chunkType).toBe('module');
    expect(chunks[0]!.imports).toContain('node:fs/promises');
    expect(chunks[0]!.imports).toContain('node:path');
  });

  it('returns chunks with non-empty id and correct startLine/endLine', async () => {
    const filePath = await makeFile('lines.ts', `
export function alpha(): void {}
export function beta(): void {}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of chunks) {
      expect(chunk.id).toBeTruthy();
      expect(chunk.id.length).toBeGreaterThan(0);
      expect(chunk.startLine).toBeGreaterThanOrEqual(1);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
    }
  });

  it('parses .js files (JavaScript) correctly', async () => {
    const filePath = await makeFile('util.js', `
export function add(a, b) {
  return a + b;
}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const fn = chunks.find((c) => c.chunkType === 'function');
    expect(fn).toBeDefined();
    expect(fn!.name).toBe('add');
    expect(fn!.language).toBe('javascript');
  });

  it('throws an error for non-existent files', async () => {
    await expect(
      parseFile('/does/not/exist/file.ts'),
    ).rejects.toThrow();
  });
});

describe('parseFile — TypeScript class decomposition', () => {
  it('extracts methods from classes as separate function chunks', async () => {
    const filePath = await makeFile('service.ts', `
export class OrderService {
  private orders: string[] = [];

  addOrder(name: string): void {
    this.orders.push(name);
  }

  removeOrder(name: string): void {
    this.orders = this.orders.filter(o => o !== name);
  }

  getOrders(): string[] {
    return this.orders;
  }
}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class');
    expect(cls).toBeDefined();
    expect(cls!.name).toBe('OrderService');

    const methods = chunks.filter((c) => c.chunkType === 'function');
    expect(methods.length).toBeGreaterThanOrEqual(3);
    const names = methods.map((m) => m.name);
    expect(names).toContain('addOrder');
    expect(names).toContain('removeOrder');
    expect(names).toContain('getOrders');
  });

  it('sets parentName on method chunks extracted from a class', async () => {
    const filePath = await makeFile('parent.ts', `
export class UserService {
  getUser(): string { return 'user'; }
}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const method = chunks.find((c) => c.chunkType === 'function' && c.name === 'getUser');
    expect(method).toBeDefined();
    expect(method!.parentName).toBe('UserService');
  });
});

describe('parseFile — oversized chunk splitting', () => {
  it('splits an oversized TypeScript function into sub-chunks', async () => {
    // Generate a function with 50 body lines
    const bodyLines = Array.from({ length: 50 }, (_, i) =>
      `  const v${i} = process(${i});`,
    );
    const content = [
      'export function bigFn(): void {',
      ...bodyLines,
      '}',
    ].join('\n');

    const filePath = await makeFile('big.ts', content);
    const chunks = await parseFile(filePath, { projectRoot: tmpDir, maxChunkLines: 20 });

    // Should be split into multiple sub-chunks
    expect(chunks.length).toBeGreaterThan(1);

    // Each sub-chunk should reference the parent
    for (const chunk of chunks) {
      expect(chunk.parentName).toBe('bigFn');
    }

    // Each sub-chunk should contain the signature for context
    for (const chunk of chunks) {
      expect(chunk.content).toContain('export function bigFn(): void {');
    }
  });

  it('does not split a small function when maxChunkLines is large', async () => {
    const filePath = await makeFile('small.ts', `
export function smallFn(): string {
  return 'hello';
}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir, maxChunkLines: 200 });
    const fn = chunks.find((c) => c.name === 'smallFn');
    expect(fn).toBeDefined();
    expect(fn!.parentName).toBeUndefined();
  });

  it('splits an oversized Java method into sub-chunks', async () => {
    const bodyLines = Array.from({ length: 50 }, (_, i) =>
      `        int v${i} = process(${i});`,
    );
    const content = [
      'public class BigService {',
      '    public void bigMethod() {',
      ...bodyLines,
      '    }',
      '}',
    ].join('\n');

    const filePath = await makeFile('BigService.java', content);
    const chunks = await parseFile(filePath, { projectRoot: tmpDir, maxChunkLines: 20 });

    // Should have the class chunk plus split method chunks
    const methodChunks = chunks.filter((c) => c.parentName === 'bigMethod');
    expect(methodChunks.length).toBeGreaterThan(1);
  });
});

describe('parseFile — Java', () => {
  it('detects class declarations with correct chunkType and name', async () => {
    const filePath = await makeFile('UserService.java', `
public class UserService {
    private String name;

    public UserService(String name) {
        this.name = name;
    }

    public String getName() {
        return this.name;
    }
}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class' && c.name === 'UserService');
    expect(cls).toBeDefined();
    expect(cls!.language).toBe('java');
  });

  it('detects method declarations inside classes', async () => {
    const filePath = await makeFile('Calculator.java', `
public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }

    public int subtract(int a, int b) {
        return a - b;
    }
}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const methods = chunks.filter((c) => c.chunkType === 'function');
    expect(methods.length).toBeGreaterThanOrEqual(2);
    const names = methods.map((m) => m.name);
    expect(names).toContain('add');
    expect(names).toContain('subtract');
  });

  it('detects interface declarations', async () => {
    const filePath = await makeFile('Repository.java', `
public interface Repository {
    void save(Object entity);
    Object findById(String id);
}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const iface = chunks.find((c) => c.chunkType === 'interface' && c.name === 'Repository');
    expect(iface).toBeDefined();
  });

  it('detects enum declarations', async () => {
    const filePath = await makeFile('Status.java', `
public enum Status {
    ACTIVE,
    INACTIVE,
    PENDING
}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const en = chunks.find((c) => c.chunkType === 'enum' && c.name === 'Status');
    expect(en).toBeDefined();
  });

  it('extracts import statements', async () => {
    const filePath = await makeFile('App.java', `
import java.util.List;
import java.util.Map;

public class App {
    public List<String> getItems() {
        return List.of("a", "b");
    }
}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const withImports = chunks.filter((c) => c.imports.length > 0);
    expect(withImports.length).toBeGreaterThan(0);
    const allImports = withImports.flatMap((c) => c.imports);
    expect(allImports).toContain('java.util.List');
    expect(allImports).toContain('java.util.Map');
  });

  it('returns a module chunk for an empty Java file', async () => {
    const filePath = await makeFile('Empty.java', `
// just a comment
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.chunkType).toBe('module');
    expect(chunks[0]!.language).toBe('java');
  });

  it('sets relativePath correctly when projectRoot is provided', async () => {
    const filePath = await makeFile('Foo.java', `
public class Foo {}
    `.trim());

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]!.relativePath).toBe('Foo.java');
  });
});
