import { describe, it, expect } from 'vitest';
import { parseTypeScript } from './typescript.js';

// ── T112: TypeScript decorator extraction → annotationMeta ────────────────────

describe('parseTypeScript - annotationMeta from decorators (T112)', () => {
  it('extracts @Controller route path into annotationMeta.endpointPaths', () => {
    const source = `
import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('entries')
@Controller('v1/entries')
export class EntryController {
  @Get(':id')
  @ApiOperation({ summary: 'Get entry by ID' })
  getEntry() {}

  @Post()
  @ApiOperation({ summary: 'Create a new entry' })
  createEntry() {}
}
    `.trim();

    const chunks = parseTypeScript(
      source,
      '/src/entry.controller.ts',
      'src/entry.controller.ts',
      'typescript',
    );
    const classChunk = chunks.find((c) => c.chunkType === 'class' && c.name === 'EntryController');

    expect(classChunk).toBeDefined();
    expect(classChunk!.annotationMeta).toBeDefined();
    expect(classChunk!.annotationMeta!.endpointPaths).toContain('v1/entries');
    expect(classChunk!.annotationMeta!.endpointPaths).toContain(':id');
  });

  it('extracts @ApiTags value into annotationMeta.tagName', () => {
    const source = `
import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('entries')
@Controller('v1/entries')
export class EntryController {
  getEntry() {}
}
    `.trim();

    const chunks = parseTypeScript(
      source,
      '/src/entry.controller.ts',
      'src/entry.controller.ts',
      'typescript',
    );
    const classChunk = chunks.find((c) => c.chunkType === 'class' && c.name === 'EntryController');

    expect(classChunk).toBeDefined();
    expect(classChunk!.annotationMeta).toBeDefined();
    expect(classChunk!.annotationMeta!.tagName).toBe('entries');
  });

  it('extracts @ApiOperation summary into annotationMeta.operationSummaries', () => {
    const source = `
import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

@Controller('v1/entries')
export class EntryController {
  @Get(':id')
  @ApiOperation({ summary: 'Get entry by ID' })
  getEntry() {}

  @Post()
  @ApiOperation({ summary: 'Create a new entry' })
  createEntry() {}
}
    `.trim();

    const chunks = parseTypeScript(
      source,
      '/src/entry.controller.ts',
      'src/entry.controller.ts',
      'typescript',
    );
    const classChunk = chunks.find((c) => c.chunkType === 'class' && c.name === 'EntryController');

    expect(classChunk).toBeDefined();
    expect(classChunk!.annotationMeta).toBeDefined();
    expect(classChunk!.annotationMeta!.operationSummaries).toContain('Get entry by ID');
    expect(classChunk!.annotationMeta!.operationSummaries).toContain('Create a new entry');
  });

  it('extracts HTTP method decorators (@Get, @Post, @Put, @Delete, @Patch) into annotationMeta.httpMethods', () => {
    const source = `
import { Controller, Get, Post, Put, Delete, Patch } from '@nestjs/common';

@Controller('v1/items')
export class ItemController {
  @Get()
  findAll() {}

  @Post()
  create() {}

  @Put(':id')
  update() {}

  @Delete(':id')
  remove() {}

  @Patch(':id')
  partialUpdate() {}
}
    `.trim();

    const chunks = parseTypeScript(
      source,
      '/src/item.controller.ts',
      'src/item.controller.ts',
      'typescript',
    );
    const classChunk = chunks.find((c) => c.chunkType === 'class' && c.name === 'ItemController');

    expect(classChunk).toBeDefined();
    expect(classChunk!.annotationMeta).toBeDefined();
    expect(classChunk!.annotationMeta!.httpMethods).toContain('GET');
    expect(classChunk!.annotationMeta!.httpMethods).toContain('POST');
    expect(classChunk!.annotationMeta!.httpMethods).toContain('PUT');
    expect(classChunk!.annotationMeta!.httpMethods).toContain('DELETE');
    expect(classChunk!.annotationMeta!.httpMethods).toContain('PATCH');
  });

  it('does not produce annotationMeta for classes without relevant decorators', () => {
    const source = `
export class PlainService {
  doWork() {}
}
    `.trim();

    const chunks = parseTypeScript(
      source,
      '/src/plain.service.ts',
      'src/plain.service.ts',
      'typescript',
    );
    const classChunk = chunks.find((c) => c.chunkType === 'class' && c.name === 'PlainService');

    expect(classChunk).toBeDefined();
    // annotationMeta should be undefined or have no meaningful values
    if (classChunk!.annotationMeta) {
      expect(classChunk!.annotationMeta.operationSummaries ?? []).toHaveLength(0);
      expect(classChunk!.annotationMeta.endpointPaths ?? []).toHaveLength(0);
      expect(classChunk!.annotationMeta.httpMethods ?? []).toHaveLength(0);
      expect(classChunk!.annotationMeta.tagName).toBeUndefined();
    }
  });
});

describe('parseTypeScript - documentation and decorator start lines', () => {
  it('records the JSDoc start line for a documented method', () => {
    const source = [
      'export class AccountService {',
      '  /** Loads an account. */',
      '  load() {}',
      '}',
    ].join('\n');

    const method = parseTypeScript(
      source,
      '/src/account-service.ts',
      'src/account-service.ts',
      'typescript',
    ).find((chunk) => chunk.name === 'load');

    expect(method?.docCommentStartLine).toBe(2);
    expect(method?.annotationStartLine).toBeUndefined();
  });

  it('records the decorator start line for an annotated method', () => {
    const source = [
      'export class AccountService {',
      '  @Transactional()',
      '  save() {}',
      '}',
    ].join('\n');

    const method = parseTypeScript(
      source,
      '/src/account-service.ts',
      'src/account-service.ts',
      'typescript',
    ).find((chunk) => chunk.name === 'save');

    expect(method?.annotationStartLine).toBe(2);
    expect(method?.docCommentStartLine).toBeUndefined();
  });

  it('records both offsets when JSDoc and decorators precede a method', () => {
    const source = [
      'export class AccountService {',
      '  /** Updates an account. */',
      '  @Transactional()',
      '  update() {}',
      '}',
    ].join('\n');

    const method = parseTypeScript(
      source,
      '/src/account-service.ts',
      'src/account-service.ts',
      'typescript',
    ).find((chunk) => chunk.name === 'update');

    expect(method?.docCommentStartLine).toBe(2);
    expect(method?.annotationStartLine).toBe(3);
    expect(method?.docCommentStartLine).toBeLessThan(method?.annotationStartLine ?? Infinity);
  });

  it('leaves both offsets undefined for a bare method', () => {
    const source = ['export class AccountService {', '  clear() {}', '}'].join('\n');

    const method = parseTypeScript(
      source,
      '/src/account-service.ts',
      'src/account-service.ts',
      'typescript',
    ).find((chunk) => chunk.name === 'clear');

    expect(method?.docCommentStartLine).toBeUndefined();
    expect(method?.annotationStartLine).toBeUndefined();
  });

  it('uses the earliest line when multiple decorators precede a method', () => {
    const source = [
      'export class AccountService {',
      '  @Transactional()',
      '  @Audited()',
      '  save() {}',
      '}',
    ].join('\n');

    const method = parseTypeScript(
      source,
      '/src/account-service.ts',
      'src/account-service.ts',
      'typescript',
    ).find((chunk) => chunk.name === 'save');

    expect(method?.annotationStartLine).toBe(2);
  });
});
