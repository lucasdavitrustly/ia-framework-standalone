import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { coercedNumber, coercedBoolean } from './coerce.js';

describe('coercedNumber', () => {
  const schema = coercedNumber();

  it('accepts native numbers unchanged', () => {
    expect(schema.parse(8)).toBe(8);
    expect(schema.parse(0)).toBe(0);
    expect(schema.parse(-1)).toBe(-1);
    expect(schema.parse(0.5)).toBe(0.5);
  });

  it('coerces numeric strings to numbers (the Bedrock serialization quirk)', () => {
    expect(schema.parse('8')).toBe(8);
    expect(schema.parse('0')).toBe(0);
    expect(schema.parse('-1')).toBe(-1);
    expect(schema.parse('0.5')).toBe(0.5);
  });

  it('trims surrounding whitespace before coercing', () => {
    expect(schema.parse('  10  ')).toBe(10);
  });

  it('rejects non-numeric strings', () => {
    expect(() => schema.parse('abc')).toThrow();
    expect(() => schema.parse('')).toThrow();
    expect(() => schema.parse('   ')).toThrow();
  });

  it('rejects NaN and Infinity', () => {
    expect(() => schema.parse('NaN')).toThrow();
    expect(() => schema.parse('Infinity')).toThrow();
    expect(() => schema.parse(Number.NaN)).toThrow();
  });

  it('works when wrapped in .optional()', () => {
    const opt = coercedNumber().optional();
    expect(opt.parse(undefined)).toBeUndefined();
    expect(opt.parse('5')).toBe(5);
    expect(opt.parse(5)).toBe(5);
  });
});

describe('coercedBoolean', () => {
  const schema = coercedBoolean();

  it('accepts native booleans unchanged', () => {
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(false)).toBe(false);
  });

  it('coerces "true"/"false" string literals correctly', () => {
    expect(schema.parse('true')).toBe(true);
    expect(schema.parse('false')).toBe(false);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(schema.parse('TRUE')).toBe(true);
    expect(schema.parse('  False ')).toBe(false);
  });

  it('coerces "1"/"0" to boolean', () => {
    expect(schema.parse('1')).toBe(true);
    expect(schema.parse('0')).toBe(false);
  });

  it('does NOT treat "false" as truthy (unlike z.coerce.boolean)', () => {
    // Guard against regressing to z.coerce.boolean(), which would return true here.
    expect(schema.parse('false')).toBe(false);
    expect(z.coerce.boolean().parse('false')).toBe(true);
  });

  it('rejects arbitrary non-boolean strings', () => {
    expect(() => schema.parse('maybe')).toThrow();
    expect(() => schema.parse('')).toThrow();
  });

  it('works when wrapped in .optional()', () => {
    const opt = coercedBoolean().optional();
    expect(opt.parse(undefined)).toBeUndefined();
    expect(opt.parse('false')).toBe(false);
    expect(opt.parse(true)).toBe(true);
  });
});
