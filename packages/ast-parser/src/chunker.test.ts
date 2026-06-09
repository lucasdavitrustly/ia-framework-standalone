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
    const filePath = await makeFile(
      'index.ts',
      `
export function greet(name: string): string {
  return \`Hello \${name}\`;
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const fn = chunks.find((c) => c.chunkType === 'function');
    expect(fn).toBeDefined();
    expect(fn!.name).toBe('greet');
  });

  it('detects class declarations with correct chunkType and name', async () => {
    const filePath = await makeFile(
      'class.ts',
      `
export class UserService {
  private users: string[] = [];

  addUser(name: string): void {
    this.users.push(name);
  }
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class');
    expect(cls).toBeDefined();
    expect(cls!.name).toBe('UserService');
  });

  it('detects interface declarations with correct chunkType', async () => {
    const filePath = await makeFile(
      'interface.ts',
      `
export interface User {
  id: string;
  name: string;
  email?: string;
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const iface = chunks.find((c) => c.chunkType === 'interface');
    expect(iface).toBeDefined();
    expect(iface!.name).toBe('User');
  });

  it('extracts imports from a file with import statements', async () => {
    const filePath = await makeFile(
      'with-imports.ts',
      `
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function loadFile(path: string): Promise<string> {
  return readFile(join(path), 'utf-8');
}
    `.trim(),
    );

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
    const filePath = await makeFile(
      'imports-only.ts',
      `
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.chunkType).toBe('module');
    expect(chunks[0]!.imports).toContain('node:fs/promises');
    expect(chunks[0]!.imports).toContain('node:path');
  });

  it('returns chunks with non-empty id and correct startLine/endLine', async () => {
    const filePath = await makeFile(
      'lines.ts',
      `
export function alpha(): void {}
export function beta(): void {}
    `.trim(),
    );

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
    const filePath = await makeFile(
      'util.js',
      `
export function add(a, b) {
  return a + b;
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const fn = chunks.find((c) => c.chunkType === 'function');
    expect(fn).toBeDefined();
    expect(fn!.name).toBe('add');
    expect(fn!.language).toBe('javascript');
  });

  it('throws an error for non-existent files', async () => {
    await expect(parseFile('/does/not/exist/file.ts')).rejects.toThrow();
  });
});

describe('parseFile — TypeScript class decomposition', () => {
  it('extracts methods from classes as separate function chunks', async () => {
    const filePath = await makeFile(
      'service.ts',
      `
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
    `.trim(),
    );

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
    const filePath = await makeFile(
      'parent.ts',
      `
export class UserService {
  getUser(): string { return 'user'; }
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const method = chunks.find((c) => c.chunkType === 'function' && c.name === 'getUser');
    expect(method).toBeDefined();
    expect(method!.parentName).toBe('UserService');
  });
});

describe('parseFile — oversized chunk splitting', () => {
  it('keeps an oversized TypeScript function whole (never splits mid-body) [T043]', async () => {
    // Generate a function with 50 body lines — exceeds maxChunkLines=20, but must NOT be split
    const bodyLines = Array.from({ length: 50 }, (_, i) => `  const v${i} = process(${i});`);
    const content = ['export function bigFn(): void {', ...bodyLines, '}'].join('\n');

    const filePath = await makeFile('big.ts', content);
    const chunks = await parseFile(filePath, { projectRoot: tmpDir, maxChunkLines: 20 });

    // Must NOT be split into sub-chunks (function semantic integrity preserved)
    const splitParts = chunks.filter((c) => c.name?.includes('bigFn$part'));
    expect(splitParts).toHaveLength(0);

    // The whole-function chunk must exist
    const fnChunk = chunks.find((c) => c.name === 'bigFn');
    expect(fnChunk).toBeDefined();
    expect(fnChunk!.content).toContain('export function bigFn(): void {');
  });

  it('does not split a small function when maxChunkLines is large', async () => {
    const filePath = await makeFile(
      'small.ts',
      `
export function smallFn(): string {
  return 'hello';
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir, maxChunkLines: 200 });
    const fn = chunks.find((c) => c.name === 'smallFn');
    expect(fn).toBeDefined();
    expect(fn!.parentName).toBeUndefined();
  });
});

describe('parseFile — Java', () => {
  it('detects class declarations with correct chunkType and name', async () => {
    const filePath = await makeFile(
      'UserService.java',
      `
public class UserService {
    private String name;

    public UserService(String name) {
        this.name = name;
    }

    public String getName() {
        return this.name;
    }
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class' && c.name === 'UserService');
    expect(cls).toBeDefined();
    expect(cls!.language).toBe('java');
  });

  it('detects method declarations inside classes', async () => {
    const filePath = await makeFile(
      'Calculator.java',
      `
public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }

    public int subtract(int a, int b) {
        return a - b;
    }
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const methods = chunks.filter((c) => c.chunkType === 'function');
    expect(methods.length).toBeGreaterThanOrEqual(2);
    const names = methods.map((m) => m.name);
    expect(names).toContain('add');
    expect(names).toContain('subtract');
  });

  it('detects interface declarations', async () => {
    const filePath = await makeFile(
      'Repository.java',
      `
public interface Repository {
    void save(Object entity);
    Object findById(String id);
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const iface = chunks.find((c) => c.chunkType === 'interface' && c.name === 'Repository');
    expect(iface).toBeDefined();
  });

  it('detects enum declarations', async () => {
    const filePath = await makeFile(
      'Status.java',
      `
public enum Status {
    ACTIVE,
    INACTIVE,
    PENDING
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const en = chunks.find((c) => c.chunkType === 'enum' && c.name === 'Status');
    expect(en).toBeDefined();
  });

  it('extracts import statements', async () => {
    const filePath = await makeFile(
      'App.java',
      `
import java.util.List;
import java.util.Map;

public class App {
    public List<String> getItems() {
        return List.of("a", "b");
    }
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const withImports = chunks.filter((c) => c.imports.length > 0);
    expect(withImports.length).toBeGreaterThan(0);
    const allImports = withImports.flatMap((c) => c.imports);
    expect(allImports).toContain('java.util.List');
    expect(allImports).toContain('java.util.Map');
  });

  it('returns a module chunk for an empty Java file', async () => {
    const filePath = await makeFile(
      'Empty.java',
      `
// just a comment
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.chunkType).toBe('module');
    expect(chunks[0]!.language).toBe('java');
  });

  it('sets relativePath correctly when projectRoot is provided', async () => {
    const filePath = await makeFile(
      'Foo.java',
      `
public class Foo {}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]!.relativePath).toBe('Foo.java');
  });
});

describe('parseFile — Java preamble and fallback', () => {
  it('method chunks include class-level preamble (package + imports + class signature)', async () => {
    const filePath = await makeFile(
      'OrderService.java',
      `
package com.example.service;

import java.util.List;
import java.util.Map;

public class OrderService {
    public List<String> getOrders() {
        return List.of("order1");
    }

    public void createOrder(String name) {
        // logic
    }
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const methods = chunks.filter((c) => c.chunkType === 'function');
    expect(methods.length).toBeGreaterThanOrEqual(2);

    for (const method of methods) {
      expect(method.content).toContain('package com.example.service;');
      expect(method.content).toContain('import java.util.List;');
      expect(method.content).toContain('import java.util.Map;');
      expect(method.content).toContain('public class OrderService {');
    }
  });

  it('method chunks have parentName set to the enclosing class name', async () => {
    const filePath = await makeFile(
      'UserService.java',
      `
package com.example;

public class UserService {
    public String getUser() {
        return "user";
    }

    public void saveUser(String name) {
        // save
    }
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const methods = chunks.filter((c) => c.chunkType === 'function');
    expect(methods.length).toBeGreaterThanOrEqual(2);

    for (const method of methods) {
      expect(method.parentName).toBe('UserService');
    }
  });

  it('constructor chunks include preamble and parentName', async () => {
    const filePath = await makeFile(
      'ProductService.java',
      `
package com.example;

import java.util.ArrayList;

public class ProductService {
    private String name;

    public ProductService(String name) {
        this.name = name;
    }
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const constructors = chunks.filter(
      (c) => c.chunkType === 'function' && c.name === 'ProductService',
    );
    expect(constructors.length).toBeGreaterThanOrEqual(1);

    const ctor = constructors[0]!;
    expect(ctor.content).toContain('package com.example;');
    expect(ctor.content).toContain('public class ProductService {');
    expect(ctor.parentName).toBe('ProductService');
  });

  it('top-level class chunk does NOT have preamble prepended', async () => {
    const filePath = await makeFile(
      'SimpleClass.java',
      `
package com.example;

import java.util.List;

public class SimpleClass {
    public void doSomething() {}
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const classChunk = chunks.find((c) => c.chunkType === 'class' && c.name === 'SimpleClass');
    expect(classChunk).toBeDefined();

    // The class chunk content should start with "public class" or the original source,
    // NOT be duplicated with a leading package + imports preamble
    const firstLine = classChunk!.content.split('\n')[0]!.trim();
    expect(firstLine).toBe('public class SimpleClass {');
  });

  it('interface method declarations include preamble with interface signature', async () => {
    const filePath = await makeFile(
      'Repository.java',
      `
package com.example.repo;

import java.util.Optional;

public interface Repository {
    void save(Object entity);
    Optional<Object> findById(String id);
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const methods = chunks.filter((c) => c.chunkType === 'function');
    expect(methods.length).toBeGreaterThanOrEqual(1);

    for (const method of methods) {
      expect(method.content).toContain('package com.example.repo;');
      expect(method.content).toContain('public interface Repository {');
    }
  });

  it('returns a fallback module chunk (does not throw) when Java source has syntax errors', async () => {
    // Unclosed brace — syntactically broken
    const filePath = await makeFile(
      'Broken.java',
      `
public class Broken {
    public void brokenMethod() {
        // missing closing braces
    `.trim(),
    );

    let chunks: Awaited<ReturnType<typeof parseFile>>;
    await expect(
      parseFile(filePath, { projectRoot: tmpDir }).then((c) => {
        chunks = c;
        return c;
      }),
    ).resolves.toBeDefined();
    expect(chunks!.length).toBeGreaterThanOrEqual(1);
  });

  it('preamble works correctly when Java file has no package statement', async () => {
    const filePath = await makeFile(
      'NoPackage.java',
      `
import java.util.List;

public class NoPackage {
    public List<String> items() {
        return List.of();
    }
}
    `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const methods = chunks.filter((c) => c.chunkType === 'function');
    expect(methods.length).toBeGreaterThanOrEqual(1);

    const method = methods[0]!;
    // No package line — preamble should still include imports and class signature
    expect(method.content).toContain('import java.util.List;');
    expect(method.content).toContain('public class NoPackage {');
    expect(method.parentName).toBe('NoPackage');
  });
});

describe('parseFile — Java Spring Boot integration', () => {
  const springBootSource = `
package com.example.demo.controller;

import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    @Autowired
    private OrderService orderService;

    @GetMapping
    public List<OrderDTO> getAllOrders() {
        return orderService.findAll();
    }

    @GetMapping("/{id}")
    public Optional<OrderDTO> getOrderById(@PathVariable Long id) {
        return orderService.findById(id);
    }

    @PostMapping
    public OrderDTO createOrder(@RequestBody CreateOrderRequest request) {
        return orderService.create(request);
    }
}
  `.trim();

  it('produces >= 4 chunks (class + 3 methods + field)', async () => {
    const filePath = await makeFile('OrderController.java', springBootSource);
    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    expect(chunks.length).toBeGreaterThanOrEqual(4);
  });

  it('each method chunk content contains the package declaration', async () => {
    const filePath = await makeFile('OrderController.java', springBootSource);
    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const methods = chunks.filter((c) => c.chunkType === 'function');
    expect(methods.length).toBeGreaterThanOrEqual(3);
    for (const method of methods) {
      expect(method.content).toContain('package com.example.demo.controller');
    }
  });

  it('each method chunk content contains the class signature', async () => {
    const filePath = await makeFile('OrderController.java', springBootSource);
    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const methods = chunks.filter((c) => c.chunkType === 'function');
    for (const method of methods) {
      expect(method.content).toContain('public class OrderController');
    }
  });

  it('each method chunk content contains Spring import statements', async () => {
    const filePath = await makeFile('OrderController.java', springBootSource);
    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const methods = chunks.filter((c) => c.chunkType === 'function');
    for (const method of methods) {
      expect(method.content).toContain('import org.springframework');
    }
  });

  it('method chunks have parentName === OrderController', async () => {
    const filePath = await makeFile('OrderController.java', springBootSource);
    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const methods = chunks.filter((c) => c.chunkType === 'function');
    for (const method of methods) {
      expect(method.parentName).toBe('OrderController');
    }
  });

  it('class chunk exists with name OrderController and chunkType class', async () => {
    const filePath = await makeFile('OrderController.java', springBootSource);
    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class' && c.name === 'OrderController');
    expect(cls).toBeDefined();
  });

  it('method chunk content includes HTTP method annotations (@GetMapping, @PostMapping)', async () => {
    const filePath = await makeFile('OrderController.java', springBootSource);
    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const methods = chunks.filter((c) => c.chunkType === 'function');
    const allContent = methods.map((m) => m.content).join('\n');
    expect(allContent).toContain('@GetMapping');
    expect(allContent).toContain('@PostMapping');
  });
});

describe('parseFile — Java hierarchy extraction', () => {
  it('extracts superclass from class extends', async () => {
    const filePath = await makeFile(
      'PaymentService.java',
      `
public class PaymentService extends BaseService {
    public void process() {}
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class' && c.name === 'PaymentService');
    expect(cls).toBeDefined();
    expect(cls!.superclass).toBe('BaseService');
  });

  it('extracts superclass and interfaces from class extends + implements', async () => {
    const filePath = await makeFile(
      'OrderService.java',
      `
public class OrderService extends BaseService implements Serializable, Auditable {
    public void process() {}
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class' && c.name === 'OrderService');
    expect(cls).toBeDefined();
    expect(cls!.superclass).toBe('BaseService');
    expect(cls!.interfaces).toEqual(['Serializable', 'Auditable']);
  });

  it('marks nested inner class with isInnerClass=true and parentName of outer class', async () => {
    const filePath = await makeFile(
      'Outer.java',
      `
public class Outer {
    public class Inner {
        public void doThing() {}
    }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const inner = chunks.find((c) => c.chunkType === 'class' && c.name === 'Inner');
    expect(inner).toBeDefined();
    expect(inner!.isInnerClass).toBe(true);
    expect(inner!.parentName).toBe('Outer');
  });

  it('extracts superclass for exception class', async () => {
    const filePath = await makeFile(
      'PaymentException.java',
      `
public class PaymentException extends DomainException {
    public PaymentException(String msg) { super(msg); }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class');
    expect(cls).toBeDefined();
    expect(cls!.superclass).toBe('DomainException');
  });

  it('extracts interfaces from interface extends clause', async () => {
    const filePath = await makeFile(
      'Foo.java',
      `
public interface Foo extends Bar, Baz {
    void doFoo();
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const iface = chunks.find((c) => c.chunkType === 'interface' && c.name === 'Foo');
    expect(iface).toBeDefined();
    expect(iface!.interfaces).toEqual(expect.arrayContaining(['Bar', 'Baz']));
  });

  it('strips generic parameters from superclass name', async () => {
    const filePath = await makeFile(
      'GenericService.java',
      `
public class GenericService extends Base<String> {
    public void process() {}
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class');
    expect(cls).toBeDefined();
    expect(cls!.superclass).toBe('Base');
  });
});

describe('parseFile — TypeScript hierarchy extraction', () => {
  it('extracts superclass from class extends', async () => {
    const filePath = await makeFile(
      'UserService.ts',
      `
class UserService extends BaseService {
  getUser(): string { return 'user'; }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class' && c.name === 'UserService');
    expect(cls).toBeDefined();
    expect(cls!.superclass).toBe('BaseService');
  });

  it('extracts superclass and interfaces from class extends + implements', async () => {
    const filePath = await makeFile(
      'UserService2.ts',
      `
class UserService extends BaseService implements Logger, Auditable {
  getUser(): string { return 'user'; }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class');
    expect(cls).toBeDefined();
    expect(cls!.superclass).toBe('BaseService');
  });
});

describe('decorator and annotation preservation', () => {
  it('Java: includes @Transactional and @CacheEvict in method chunk content', async () => {
    const filePath = await makeFile(
      'OrderService.java',
      `
public class OrderService {
  @Transactional
  @CacheEvict(value = "orders", key = "#id")
  public void updateOrder(Long id, OrderDto dto) {
    // update logic
  }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const method = chunks.find((c) => c.chunkType === 'function' && c.name === 'updateOrder');
    expect(method).toBeDefined();
    expect(method!.content).toContain('@Transactional');
    expect(method!.content).toContain('@CacheEvict');
  });

  it('Java: @Aspect class produces a single aspect chunk', async () => {
    const filePath = await makeFile(
      'AuditAspect.java',
      `
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;

@Aspect
public class AuditAspect {
  @Before("execution(* com.example..*(..))")
  public void audit() {
    // log
  }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.chunkType).toBe('aspect');
    expect(chunks[0]!.name).toBe('AuditAspect');
    expect(chunks[0]!.content).toContain('@Aspect');
    expect(chunks[0]!.content).toContain('@Before');
  });

  it('Java: regular class with @Service is not treated as aspect', async () => {
    const filePath = await makeFile(
      'PaymentService.java',
      `
import org.springframework.stereotype.Service;

@Service
public class PaymentService {
  public void pay(Long amount) {}
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.name === 'PaymentService');
    expect(cls).toBeDefined();
    expect(cls!.chunkType).toBe('class');
  });

  it('TypeScript: @Injectable() decorator included in class chunk content', async () => {
    const filePath = await makeFile(
      'user.service.ts',
      `
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UserService {
  getUser(id: number) { return null; }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class' && c.name === 'UserService');
    expect(cls).toBeDefined();
    expect(cls!.content).toContain('@Injectable');
  });

  it('TypeScript: @Get() decorator included in method sub-chunk content', async () => {
    const filePath = await makeFile(
      'user.controller.ts',
      `
import { Controller, Get } from '@nestjs/common';

@Controller('users')
export class UserController {
  @Get(':id')
  findOne(id: string) { return null; }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const method = chunks.find((c) => c.chunkType === 'function' && c.name === 'findOne');
    expect(method).toBeDefined();
    expect(method!.content).toContain('@Get');
  });
});

describe('parseFile - TypeScript decorator inclusion', () => {
  it('class with @Injectable() decorator produces a chunk containing the decorator text', async () => {
    const filePath = await makeFile(
      'user-service.ts',
      `
@Injectable()
export class UserService {
  constructor(private readonly repo: UserRepository) {}

  findAll(): User[] {
    return this.repo.findAll();
  }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class');
    expect(cls).toBeDefined();
    expect(cls!.content).toContain('@Injectable()');
  });

  it('class with @Controller and @Injectable decorators produces a chunk containing both', async () => {
    const filePath = await makeFile(
      'api-controller.ts',
      `
@Controller('/api')
@Injectable()
export class ApiController {
  getHealth(): string { return 'ok'; }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class');
    expect(cls).toBeDefined();
    expect(cls!.content).toContain('@Controller');
    expect(cls!.content).toContain('@Injectable()');
  });

  it('method with @Get() decorator produces a sub-chunk containing the decorator text', async () => {
    const filePath = await makeFile(
      'users-controller.ts',
      `
@Controller('/users')
export class UsersController {
  @Get('/all')
  async getAll(): Promise<User[]> {
    return [];
  }

  @Post('/create')
  async create(@Body() dto: CreateUserDto): Promise<User> {
    return {} as User;
  }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const getChunk = chunks.find((c) => c.name === 'getAll');
    expect(getChunk).toBeDefined();
    expect(getChunk!.content).toContain('@Get');

    const postChunk = chunks.find((c) => c.name === 'create');
    expect(postChunk).toBeDefined();
    expect(postChunk!.content).toContain('@Post');
  });
});

describe('parseFile — TypeScript hierarchy extraction (extended)', () => {
  it('extracts interfaces from TypeScript interface extends', async () => {
    const filePath = await makeFile(
      'ExtendedUser.ts',
      `
interface ExtendedUser extends BaseUser, Timestamped {
  extraField: string;
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const iface = chunks.find((c) => c.chunkType === 'interface' && c.name === 'ExtendedUser');
    expect(iface).toBeDefined();
    expect(iface!.interfaces).toEqual(expect.arrayContaining(['BaseUser', 'Timestamped']));
  });

  it('strips generic parameters from TypeScript superclass', async () => {
    const filePath = await makeFile(
      'Repo.ts',
      `
class Repo extends Base<Entity> {
  find(): Entity | null { return null; }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const cls = chunks.find((c) => c.chunkType === 'class');
    expect(cls).toBeDefined();
    expect(cls!.superclass).toBe('Base');
  });
});

// ── T020: contextHeader generation ────────────────────────────────────────────
//
// Each method chunk inside a class must include `contextHeader`:
//   - Class declaration line + field declarations (max 5 lines total)
//   - Used by the embedder to build the signature vector
//
// NOTE: Tests WILL FAIL until Java parser is enhanced (T024/T025).

describe('parseFile — T020: contextHeader on method chunks', () => {
  it('each method chunk inside a Java class has a non-empty contextHeader', async () => {
    const filePath = await makeFile(
      'PaymentService.java',
      `
public class PaymentService {
    private final PaymentRepository repo;
    private final Clock clock;

    public void processPayment(Payment p) {
        repo.save(p);
    }

    public void cancelPayment(String id) {
        repo.deleteById(id);
    }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const methodChunks = chunks.filter(
      (c) => c.chunkType === 'function' || c.chunkType === 'method',
    );
    expect(methodChunks.length).toBeGreaterThanOrEqual(2);

    for (const chunk of methodChunks) {
      expect(chunk.contextHeader, `contextHeader missing on chunk '${chunk.name}'`).toBeDefined();
      expect(chunk.contextHeader!.trim().length).toBeGreaterThan(0);
    }
  });

  it('contextHeader includes the class declaration line', async () => {
    const filePath = await makeFile(
      'UserService.java',
      `
public class UserService {
    private final UserRepository userRepo;

    public User findById(Long id) {
        return userRepo.findById(id).orElseThrow();
    }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const method = chunks.find((c) => c.name === 'findById');
    expect(method).toBeDefined();
    expect(method!.contextHeader).toBeDefined();
    // Context header should mention the enclosing class name
    expect(method!.contextHeader).toContain('UserService');
  });

  it('contextHeader is at most 5 lines', async () => {
    const filePath = await makeFile(
      'BigService.java',
      `
public class BigService {
    private final Dep1 dep1;
    private final Dep2 dep2;
    private final Dep3 dep3;
    private final Dep4 dep4;
    private final Dep5 dep5;
    private final Dep6 dep6;

    public void doWork() {
        dep1.run();
    }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const method = chunks.find((c) => c.name === 'doWork');
    expect(method).toBeDefined();
    expect(method!.contextHeader).toBeDefined();
    const lines = method!.contextHeader!.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBeLessThanOrEqual(5);
  });
});

// ── T021: class-signature chunk ────────────────────────────────────────────────
//
// When a Java class is parsed, a special 'class-signature' chunk must be produced.
// It contains: class declaration + field declarations + method signatures (no bodies).
//
// NOTE: Tests WILL FAIL until Java parser is enhanced (T024/T025).

describe('parseFile — T021: class-signature chunks', () => {
  it('produces a class-signature chunk for a Java class', async () => {
    const filePath = await makeFile(
      'PaymentService.java',
      `
public class PaymentService {
    private final PaymentRepository repo;

    public void processPayment(Payment p) {
        repo.save(p);
    }

    public Payment findById(String id) {
        return repo.findById(id);
    }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const sigChunk = chunks.find((c) => c.chunkType === 'class-signature');
    expect(sigChunk, 'Expected a class-signature chunk to be produced').toBeDefined();
  });

  it('class-signature chunk contains class declaration and method signatures', async () => {
    const filePath = await makeFile(
      'OrderService.java',
      `
public class OrderService {
    private final OrderRepository orderRepo;
    private final PaymentService paymentService;

    public Order createOrder(CreateOrderRequest req) {
        // complex body
        Order o = new Order(req.getItems());
        return orderRepo.save(o);
    }

    public void cancelOrder(Long id) {
        Order o = orderRepo.findById(id).orElseThrow();
        o.cancel();
        orderRepo.save(o);
    }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const sigChunk = chunks.find((c) => c.chunkType === 'class-signature');
    expect(sigChunk).toBeDefined();

    const content = sigChunk!.content ?? sigChunk!.classSignature ?? '';
    // Must contain the class declaration
    expect(content).toContain('OrderService');
    // Must contain method signatures
    expect(content).toContain('createOrder');
    expect(content).toContain('cancelOrder');
  });

  it('class-signature chunk does NOT contain method bodies', async () => {
    const filePath = await makeFile(
      'SimpleService.java',
      `
public class SimpleService {
    private final Repo repo;

    public String compute(String input) {
        String result = input.toUpperCase();
        result = result.trim();
        return result + "_computed";
    }
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const sigChunk = chunks.find((c) => c.chunkType === 'class-signature');
    expect(sigChunk).toBeDefined();

    const content = sigChunk!.content ?? sigChunk!.classSignature ?? '';
    // Method signature should be there...
    expect(content).toContain('compute');
    // ...but not the body implementation details
    expect(content).not.toContain('toUpperCase');
    expect(content).not.toContain('_computed');
  });

  it('class-signature chunk has name matching the class name', async () => {
    const filePath = await makeFile(
      'MyService.java',
      `
public class MyService {
    public void run() {}
}
      `.trim(),
    );

    const chunks = await parseFile(filePath, { projectRoot: tmpDir });
    const sigChunk = chunks.find((c) => c.chunkType === 'class-signature');
    expect(sigChunk).toBeDefined();
    expect(sigChunk!.name).toBe('MyService');
  });
});

// ── T042: no mid-method split ─────────────────────────────────────────────────

describe('splitOversizedChunks — no mid-method split (T042)', () => {
  it('a Java method chunk exceeding maxChunkLines is kept whole (not split mid-body)', async () => {
    // 60 body lines, maxChunkLines=30 — without protection, this would be split
    const bodyLines = Array.from({ length: 60 }, (_, i) => `    // body line ${i + 1}`).join('\n');
    const source = `
public class HugeService {
  public void bigMethod() {
${bodyLines}
    System.out.println("done");
  }
}
    `.trim();

    const filePath = await makeFile('HugeService.java', source);
    const chunks = await parseFile(filePath, { maxChunkLines: 30 });

    // bigMethod should be a single chunk, never split into bigMethod$part1, $part2 etc.
    const splitParts = chunks.filter((c) => c.name?.includes('bigMethod$part'));
    expect(splitParts).toHaveLength(0);

    // The whole-method chunk should still exist
    const methodChunk = chunks.find((c) => c.name === 'bigMethod');
    expect(methodChunk).toBeDefined();
  });

  it('a TypeScript method chunk exceeding maxChunkLines is kept whole', async () => {
    const bodyLines = Array.from({ length: 60 }, (_, i) => `    // line ${i + 1}`).join('\n');
    const source = `
class MyService {
  doWork(): void {
${bodyLines}
    console.log('done');
  }
}
    `.trim();

    const filePath = await makeFile('MyService.ts', source);
    const chunks = await parseFile(filePath, { maxChunkLines: 30 });

    const splitParts = chunks.filter((c) => c.name?.includes('doWork$part'));
    expect(splitParts).toHaveLength(0);

    const methodChunk = chunks.find((c) => c.name === 'doWork');
    expect(methodChunk).toBeDefined();
  });
});

// ── T044: leading JSDoc/comment capture ───────────────────────────────────────

describe('parseFile — T044: leading JSDoc comments included in method chunk', () => {
  it('includes a leading /** JSDoc */ block comment in the method chunk content', async () => {
    const source = `
class OrderService {
  /** Places a new order for the given customer. */
  placeOrder(customerId: string): void {
    console.log(customerId);
  }

  normalMethod(): void {}
}
    `.trim();

    const filePath = await makeFile('OrderService.ts', source);
    const chunks = await parseFile(filePath, { projectRoot: tmpDir });

    const methodChunk = chunks.find((c) => c.name === 'placeOrder');
    expect(methodChunk).toBeDefined();
    expect(methodChunk!.content).toContain('/** Places a new order for the given customer. */');
  });

  it('includes a leading // comment in the method chunk content', async () => {
    const source = `
class PaymentService {
  // Processes the payment for an order
  processPayment(orderId: string): boolean {
    return true;
  }
}
    `.trim();

    const filePath = await makeFile('PaymentService.ts', source);
    const chunks = await parseFile(filePath, { projectRoot: tmpDir });

    const methodChunk = chunks.find((c) => c.name === 'processPayment');
    expect(methodChunk).toBeDefined();
    expect(methodChunk!.content).toContain('// Processes the payment for an order');
  });
});
