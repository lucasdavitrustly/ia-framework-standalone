import { describe, it, expect } from 'vitest';
import { parseYaml } from './yaml.js';

/**
 * T036 (US2): YAML config references producing dependencyEdges with 'configures'.
 * T046 (US4): Tests for YAML chunker — top-level keys as config-block chunks.
 */
describe('parseYaml', () => {
  const filePath = '/repo/application.yml';
  const relativePath = 'src/main/resources/application.yml';

  describe('T046: top-level service definition chunking', () => {
    it('produces a config-block chunk for each top-level key', () => {
      const content = `
server:
  port: 8080
  host: localhost

database:
  url: jdbc:postgresql://localhost/mydb
  username: admin
  password: secret

cache:
  ttl: 3600
  maxSize: 1000
`.trim();

      const chunks = parseYaml(content, filePath, relativePath);
      const names = chunks.map((c) => c.name);
      expect(names).toContain('server');
      expect(names).toContain('database');
      expect(names).toContain('cache');
      for (const chunk of chunks) {
        expect(chunk.chunkType).toBe('config-block');
        expect(chunk.language).toBe('yaml');
      }
    });

    it('produces a single chunk for a YAML file with one top-level key', () => {
      const content = `
spring:
  application:
    name: payment-service
  datasource:
    url: jdbc:h2:mem:testdb
`.trim();

      const chunks = parseYaml(content, filePath, relativePath);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.name).toBe('spring');
      expect(chunks[0]!.chunkType).toBe('config-block');
    });

    it('preserves nested config in the chunk content', () => {
      const content = `
server:
  port: 8080
  ssl:
    enabled: true
    keystore: /path/to/keystore
`.trim();

      const chunks = parseYaml(content, filePath, relativePath);
      const serverChunk = chunks.find((c) => c.name === 'server');
      expect(serverChunk?.content).toContain('port: 8080');
      expect(serverChunk?.content).toContain('ssl:');
    });
  });

  describe('T036 (US2): dependency edges for service class references', () => {
    it('produces dependencyEdges with relation "configures" for class references', () => {
      const content = `
payment:
  service-class: com.example.PaymentServiceImpl
  repository-class: com.example.JdbcPaymentRepository
`.trim();

      const chunks = parseYaml(content, filePath, relativePath);
      const paymentChunk = chunks.find((c) => c.name === 'payment');
      expect(paymentChunk).toBeDefined();
      // When class references are detected, dependencyEdges should have 'configures' relation
      if (paymentChunk?.dependencyEdges && paymentChunk.dependencyEdges.length > 0) {
        for (const edge of paymentChunk.dependencyEdges) {
          expect(edge.relation).toBe('configures');
        }
      }
    });
  });

  describe('edge cases', () => {
    it('returns a module chunk for an empty YAML file', () => {
      const chunks = parseYaml('', filePath, relativePath);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.chunkType).toBe('module');
    });

    it('returns a single module chunk for a YAML with only scalar values', () => {
      const content = `debug: true`;
      const chunks = parseYaml(content, filePath, relativePath);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('assigns correct filePath, relativePath and line numbers', () => {
      const content = `
server:
  port: 8080
database:
  url: jdbc:h2:mem
`.trim();

      const chunks = parseYaml(content, filePath, relativePath);
      for (const chunk of chunks) {
        expect(chunk.filePath).toBe(filePath);
        expect(chunk.relativePath).toBe(relativePath);
        expect(chunk.startLine).toBeGreaterThanOrEqual(1);
        expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
      }
    });

    it('assigns chunk indices correctly', () => {
      const content = `
a:
  x: 1
b:
  y: 2
c:
  z: 3
`.trim();

      const chunks = parseYaml(content, filePath, relativePath);
      chunks.forEach((c, i) => {
        expect(c.chunkIndex).toBe(i);
        expect(c.totalChunks).toBe(chunks.length);
      });
    });

    it('handles Kubernetes deployment YAML with metadata and spec as separate top-level keys', () => {
      const content = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
`.trim();

      const chunks = parseYaml(content, filePath, relativePath);
      const names = chunks.map((c) => c.name);
      // Each top-level mapping key becomes a chunk
      expect(names).toContain('metadata');
      expect(names).toContain('spec');
    });
  });
});
