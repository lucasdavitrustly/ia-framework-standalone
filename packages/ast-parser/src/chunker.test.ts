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
