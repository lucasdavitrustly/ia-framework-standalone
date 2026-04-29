import { describe, expect, it } from 'vitest';
import {
  analyzeRetrievalQuery,
  buildCodeAnchor,
  inferLayerHints,
  inferModulePath,
  inferPackageName,
} from './query-intelligence.js';

describe('query intelligence', () => {
  it('extracts symbol and package terms from Java-oriented queries', () => {
    const intent = analyzeRetrievalQuery(
      'Where is PaymentController in com.acme.billing and what is the entry point?',
    );

    expect(intent.symbolTerms).toContain('PaymentController');
    expect(intent.packageTerms).toContain('com.acme.billing');
    expect(intent.entryPointQuery).toBe(true);
    expect(intent.javaQuery).toBe(true);
  });

  it('infers module paths from multi-module source layouts', () => {
    expect(inferModulePath('billing-service/src/main/java/com/acme/BillingController.java')).toBe(
      'billing-service',
    );
    expect(inferModulePath('packages/mcp-server/src/server.ts')).toBe('packages/mcp-server');
  });

  it('infers Java package names from source content or source roots', () => {
    expect(
      inferPackageName(
        'billing-service/src/main/java/com/acme/BillingController.java',
        'package com.acme.billing;\npublic class BillingController {}',
      ),
    ).toBe('com.acme.billing');

    expect(
      inferPackageName(
        'billing-service/src/main/java/com/acme/billing/BillingController.java',
        'public class BillingController {}',
      ),
    ).toBe('com.acme.billing');
  });

  it('infers architectural layer hints from paths and annotations', () => {
    const hints = inferLayerHints(
      'billing-service/src/main/java/com/acme/billing/BillingController.java',
      'class',
      '@RestController\n@Service\nclass BillingController {}',
    );

    expect(hints).toContain('controller');
    expect(hints).toContain('service');
  });

  it('builds anchored file and line references', () => {
    const anchor = buildCodeAnchor({
      relativePath: 'src/server.ts',
      startLine: 10,
      endLine: 24,
      name: 'createServer',
    });

    expect(anchor.anchor).toBe('src/server.ts:10-24 (createServer)');
  });
});
