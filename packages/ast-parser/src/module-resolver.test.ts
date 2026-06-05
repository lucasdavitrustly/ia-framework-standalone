import { describe, it, expect } from 'vitest';
import { resolveModule } from './module-resolver.js';

/**
 * T014: Module resolver tests
 * Tests MUST fail until module-resolver is implemented.
 */
describe('resolveModule', () => {
  it('returns correct moduleInfo for path with 3+ segments', () => {
    const result = resolveModule('payments/merchant-gateway/src/PaymentService.java');
    expect(result.moduleInfo.group).toBe('payments');
    expect(result.moduleInfo.module).toBe('merchant-gateway');
    expect(result.moduleInfo.submodule).toBeUndefined();
  });

  it('returns submodule for path with 4+ segments', () => {
    const result = resolveModule(
      'payments/merchant-gateway/merchant-gateway-core/src/PaymentService.java',
    );
    expect(result.moduleInfo.group).toBe('payments');
    expect(result.moduleInfo.module).toBe('merchant-gateway');
    expect(result.moduleInfo.submodule).toBe('merchant-gateway-core');
  });

  it('returns defaults for short paths', () => {
    const result = resolveModule('src/PaymentService.java');
    expect(result.moduleInfo.group).toBe('');
    expect(result.moduleInfo.module).toBe('');
  });

  it('parses Maven coordinates when pomContent provided', () => {
    const pomContent = `
      <project>
        <groupId>com.company.payments</groupId>
        <artifactId>merchant-gateway-core</artifactId>
        <version>1.2.3</version>
      </project>
    `;
    const result = resolveModule('payments/merchant-gateway/src/Service.java', pomContent);
    expect(result.mavenCoordinates).toBeDefined();
    expect(result.mavenCoordinates!.groupId).toBe('com.company.payments');
    expect(result.mavenCoordinates!.artifactId).toBe('merchant-gateway-core');
    expect(result.mavenCoordinates!.version).toBe('1.2.3');
  });

  it('returns undefined mavenCoordinates without pomContent', () => {
    const result = resolveModule('payments/merchant-gateway/src/Service.java');
    expect(result.mavenCoordinates).toBeUndefined();
  });
});
