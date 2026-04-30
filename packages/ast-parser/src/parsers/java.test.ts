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
