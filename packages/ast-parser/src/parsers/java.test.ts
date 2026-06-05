import { describe, it, expect } from 'vitest';
import { parseJava } from './java.js';

describe('parseJava - annotation inclusion', () => {
  it('method with preceding annotations produces a chunk whose content includes the annotation text', () => {
    const source = `
package com.example;

public class OrderService {
  @Transactional
  @CacheEvict(value = "orders")
  public void updateOrder() {
    // update logic
  }
}
    `.trim();

    const chunks = parseJava(source, '/src/OrderService.java', 'src/OrderService.java');
    const methodChunk = chunks.find((c) => c.name === 'updateOrder');
    expect(methodChunk).toBeDefined();
    expect(methodChunk!.content).toContain('@Transactional');
    expect(methodChunk!.content).toContain('@CacheEvict');
  });

  it('method with 3 annotations produces a chunk containing all 3 annotations', () => {
    const source = `
public class Service {
  @Override
  @Transactional
  @Deprecated
  public void process() {}
}
    `.trim();

    const chunks = parseJava(source, '/src/Service.java', 'src/Service.java');
    const methodChunk = chunks.find((c) => c.name === 'process');
    expect(methodChunk).toBeDefined();
    expect(methodChunk!.content).toContain('@Override');
    expect(methodChunk!.content).toContain('@Transactional');
    expect(methodChunk!.content).toContain('@Deprecated');
  });

  it('@Aspect class produces exactly one chunk with chunkType "aspect"', () => {
    const source = `
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

@Aspect
@Component
public class AuditAspect {
  @Around("execution(* *.*(..))")
  public Object audit(ProceedingJoinPoint jp) throws Throwable {
    return jp.proceed();
  }

  @Before("@annotation(com.example.Auditable)")
  public void beforeAuditable(JoinPoint jp) {
    System.out.println("entering");
  }
}
    `.trim();

    const chunks = parseJava(source, '/src/AuditAspect.java', 'src/AuditAspect.java');
    const aspectChunks = chunks.filter((c) => c.chunkType === 'aspect');
    expect(aspectChunks).toHaveLength(1);
    expect(aspectChunks[0]!.content).toContain('@Aspect');
    expect(aspectChunks[0]!.content).toContain('AuditAspect');
  });

  it('regular class (no @Aspect) → methods are separate chunks with annotations included', () => {
    const source = `
public class UserService {
  @Transactional
  public void createUser(String name) {}

  @Cacheable("users")
  public String getUser(Long id) { return null; }
}
    `.trim();

    const chunks = parseJava(source, '/src/UserService.java', 'src/UserService.java');
    const createChunk = chunks.find((c) => c.name === 'createUser');
    const getChunk = chunks.find((c) => c.name === 'getUser');

    expect(createChunk).toBeDefined();
    expect(createChunk!.content).toContain('@Transactional');

    expect(getChunk).toBeDefined();
    expect(getChunk!.content).toContain('@Cacheable');

    // They should be separate chunks
    expect(createChunk!.id).not.toBe(getChunk!.id);
  });

  it('buildPreamble for method inside @Aspect class includes @Aspect annotation line', () => {
    // When an @Aspect class is large enough to be processed member-by-member,
    // the preamble for each method should include the @Aspect annotation.
    // For now, @Aspect classes are emitted as a single chunk (no member splitting),
    // so the single chunk content should include @Aspect.
    const source = `
@Aspect
@Component
public class BigAspect {
  @Around("execution(* *.*(..))")
  public Object around(ProceedingJoinPoint jp) throws Throwable {
    return jp.proceed();
  }
}
    `.trim();

    const chunks = parseJava(source, '/src/BigAspect.java', 'src/BigAspect.java');
    const aspectChunk = chunks.find((c) => c.chunkType === 'aspect');
    expect(aspectChunk).toBeDefined();
    expect(aspectChunk!.content).toContain('@Aspect');
    expect(aspectChunk!.content).toContain('@Component');
  });
});

// ── T034: dependency edge extraction ─────────────────────────────────────────

describe('parseJava - dependency edges (T034)', () => {
  it('produces 3 DependencyEdge entries from 3 import declarations', () => {
    const source = `
package com.example.service;

import com.example.repository.PaymentRepository;
import com.example.service.OrderService;
import java.util.List;

public class PaymentService {
  public void processPayment() {
    // payment logic
  }
}
    `.trim();

    const chunks = parseJava(source, '/src/PaymentService.java', 'src/PaymentService.java');
    const methodChunk = chunks.find((c) => c.name === 'processPayment');
    expect(methodChunk).toBeDefined();
    expect(methodChunk!.dependencyEdges).toHaveLength(3);

    const relations = methodChunk!.dependencyEdges!.map((e) => e.relation);
    expect(relations.every((r) => r === 'imports')).toBe(true);

    const targetPaths = methodChunk!.dependencyEdges!.map((e) => e.targetPath);
    expect(targetPaths).toContain('com/example/repository/PaymentRepository.java');
    expect(targetPaths).toContain('com/example/service/OrderService.java');
    expect(targetPaths).toContain('java/util/List.java');
  });

  it('each dependency edge carries the simple class name as symbols', () => {
    const source = `
import com.example.Foo;

public class Bar {
  public void test() {}
}
    `.trim();

    const chunks = parseJava(source, '/src/Bar.java', 'src/Bar.java');
    const method = chunks.find((c) => c.name === 'test');
    expect(method?.dependencyEdges).toBeDefined();
    expect(method!.dependencyEdges![0]!.symbols).toContain('Foo');
  });

  it('produces no dependency edges when file has no imports', () => {
    const source = `
public class Plain {
  public void run() {}
}
    `.trim();

    const chunks = parseJava(source, '/src/Plain.java', 'src/Plain.java');
    const method = chunks.find((c) => c.name === 'run');
    expect(method).toBeDefined();
    // Either empty array or undefined is acceptable
    expect((method!.dependencyEdges ?? []).length).toBe(0);
  });
});

// ── T041: class chunking with 8 methods ──────────────────────────────────────

describe('parseJava - 200-line class with 8 methods (T041)', () => {
  it('produces 8 method chunks + 1 class-signature chunk, each method has contextHeader', () => {
    // Build a class with 8 methods, each ~10 lines → total ~80+ lines
    const methods = Array.from(
      { length: 8 },
      (_, i) => `
  public void method${i + 1}() {
    // body line 1
    // body line 2
    // body line 3
    // body line 4
    // body line 5
    System.out.println("method${i + 1}");
  }`,
    ).join('\n');

    const source = `
package com.example;

import com.example.Dep;

public class BigService {
  private final String name = "service";
  private final int count = 0;
${methods}
}
    `.trim();

    const chunks = parseJava(source, '/src/BigService.java', 'src/BigService.java');

    const methodChunks = chunks.filter(
      (c) => c.chunkType === 'function' || c.chunkType === 'method',
    );
    const sigChunk = chunks.find((c) => c.chunkType === 'class-signature');

    expect(methodChunks).toHaveLength(8);
    expect(sigChunk).toBeDefined();

    // Each method chunk should have contextHeader containing the class name
    for (const m of methodChunks) {
      expect(m.contextHeader, `method ${m.name} should have contextHeader`).toBeDefined();
      expect(m.contextHeader).toContain('BigService');
    }
  });
});
