import { describe, it, expect } from 'vitest';
import { parseProto } from './proto.js';

/**
 * T045: Tests for proto chunker.
 * Given a .proto file with service + message + enum definitions,
 * produces separate chunks per construct (service-def, message-def, enum).
 */
describe('parseProto', () => {
  const filePath = '/repo/service.proto';
  const relativePath = 'service.proto';

  it('produces a service-def chunk for each service definition', () => {
    const content = `
syntax = "proto3";

package com.example;

// The payment processing service
service PaymentService {
  rpc ProcessPayment (PaymentRequest) returns (PaymentResponse);
  rpc RefundPayment (RefundRequest) returns (RefundResponse);
}
`.trim();

    const chunks = parseProto(content, filePath, relativePath);
    const serviceChunks = chunks.filter((c) => c.chunkType === 'service-def');
    expect(serviceChunks).toHaveLength(1);
    expect(serviceChunks[0].name).toBe('PaymentService');
    expect(serviceChunks[0].language).toBe('proto');
  });

  it('produces a message-def chunk for each message definition', () => {
    const content = `
syntax = "proto3";

message PaymentRequest {
  string order_id = 1;
  double amount = 2;
}

message PaymentResponse {
  bool success = 1;
  string transaction_id = 2;
}
`.trim();

    const chunks = parseProto(content, filePath, relativePath);
    const messageChunks = chunks.filter((c) => c.chunkType === 'message-def');
    expect(messageChunks).toHaveLength(2);
    const names = messageChunks.map((c) => c.name);
    expect(names).toContain('PaymentRequest');
    expect(names).toContain('PaymentResponse');
  });

  it('produces an enum chunk for each enum definition', () => {
    const content = `
syntax = "proto3";

enum PaymentStatus {
  UNKNOWN = 0;
  SUCCESS = 1;
  FAILED = 2;
}
`.trim();

    const chunks = parseProto(content, filePath, relativePath);
    const enumChunks = chunks.filter((c) => c.chunkType === 'enum');
    expect(enumChunks).toHaveLength(1);
    expect(enumChunks[0].name).toBe('PaymentStatus');
  });

  it('handles a proto file with service, messages, and enum together', () => {
    const content = `
syntax = "proto3";

package com.example;

enum OrderStatus {
  PENDING = 0;
  FULFILLED = 1;
}

message OrderRequest {
  string order_id = 1;
}

message OrderResponse {
  OrderStatus status = 1;
}

service OrderService {
  rpc GetOrder (OrderRequest) returns (OrderResponse);
}
`.trim();

    const chunks = parseProto(content, filePath, relativePath);
    expect(chunks.some((c) => c.chunkType === 'service-def' && c.name === 'OrderService')).toBe(
      true,
    );
    expect(chunks.some((c) => c.chunkType === 'message-def' && c.name === 'OrderRequest')).toBe(
      true,
    );
    expect(chunks.some((c) => c.chunkType === 'message-def' && c.name === 'OrderResponse')).toBe(
      true,
    );
    expect(chunks.some((c) => c.chunkType === 'enum' && c.name === 'OrderStatus')).toBe(true);
  });

  it('includes associated leading comments in the chunk content', () => {
    const content = `
syntax = "proto3";

// The user registration service
// Handles all user lifecycle events
service UserService {
  rpc Register (RegisterRequest) returns (RegisterResponse);
}
`.trim();

    const chunks = parseProto(content, filePath, relativePath);
    const serviceChunk = chunks.find((c) => c.chunkType === 'service-def');
    expect(serviceChunk).toBeDefined();
    expect(serviceChunk?.content).toContain('// The user registration service');
  });

  it('returns a module chunk for empty proto file', () => {
    const chunks = parseProto('', filePath, relativePath);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkType).toBe('module');
  });

  it('returns a module chunk for proto file with only syntax and package', () => {
    const content = `
syntax = "proto3";
package com.example;
`.trim();

    const chunks = parseProto(content, filePath, relativePath);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkType).toBe('module');
  });

  it('assigns correct filePath, relativePath, and startLine/endLine', () => {
    const content = `syntax = "proto3";

message Foo {
  string bar = 1;
}`;

    const chunks = parseProto(content, filePath, relativePath);
    const msgChunk = chunks.find((c) => c.chunkType === 'message-def');
    expect(msgChunk?.filePath).toBe(filePath);
    expect(msgChunk?.relativePath).toBe(relativePath);
    expect(msgChunk?.startLine).toBeGreaterThanOrEqual(1);
    expect(msgChunk?.endLine).toBeGreaterThanOrEqual(msgChunk?.startLine ?? 0);
  });

  it('assigns chunk indices correctly', () => {
    const content = `
syntax = "proto3";

message Req { string id = 1; }
message Res { bool ok = 1; }
service Svc { rpc Do(Req) returns(Res); }
`.trim();

    const chunks = parseProto(content, filePath, relativePath);
    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i);
      expect(c.totalChunks).toBe(chunks.length);
    });
  });
});
