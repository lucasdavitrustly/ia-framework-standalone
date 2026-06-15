import { z } from 'zod';

/**
 * Scalar-coercing Zod helpers for MCP tool input schemas.
 *
 * Why this exists:
 * Some model providers / gateways (notably AWS Bedrock-fronted Claude behind a
 * proxy) intermittently serialize numeric and boolean tool-call arguments as
 * JSON strings ("8", "true") instead of native scalars (8, true). The MCP SDK
 * validates tool input with strict Zod schemas (z.number(), z.boolean()) that
 * reject string input, producing `-32602 Invalid input: expected number,
 * received string` errors that are non-deterministic across otherwise-identical
 * calls.
 *
 * These helpers accept either the native scalar or its string representation and
 * normalize it, making the tools tolerant of that serialization quirk without
 * changing their runtime contract.
 */

/**
 * Coerce a numeric tool argument that may arrive as a number or a numeric string.
 *
 * - Accepts native numbers as-is.
 * - Accepts strings that represent a finite number (e.g. "8", "0.5", "-1").
 * - Rejects empty strings, non-numeric strings, NaN, and Infinity so genuinely
 *   invalid input still surfaces a clear validation error.
 */
export const coercedNumber = (): z.ZodType<number> =>
  z.preprocess((value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return value; // let z.number() reject it
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  }, z.number());

/**
 * Coerce a boolean tool argument that may arrive as a boolean or a string.
 *
 * Unlike `z.coerce.boolean()` (which uses JS truthiness and turns "false" into
 * `true`), this maps the string literals "true"/"false" (case-insensitive,
 * trimmed) and "1"/"0" to their boolean values. Any other value is passed
 * through to `z.boolean()` so invalid input is rejected.
 */
export const coercedBoolean = (): z.ZodType<boolean> =>
  z.preprocess((value) => {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    return value;
  }, z.boolean());
