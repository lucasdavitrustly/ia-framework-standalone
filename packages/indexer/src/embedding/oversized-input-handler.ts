import { splitOversizedChunks, type CodeChunk } from '@ia-framework/ast-parser';
import {
  estimateProviderInputTokens,
  OversizedInputError,
} from '@ia-framework/core';

type ChunkWithRuntimeMetadata = CodeChunk & {
  repoId?: string;
  signature?: string;
  signatureOnly?: boolean;
};

export type HandledChunk = ChunkWithRuntimeMetadata;

export type OversizedHandlingMode = 'unchanged' | 'split' | 'signature-only';

export interface OversizedHandlingResult<T extends CodeChunk = HandledChunk> {
  readonly mode: OversizedHandlingMode;
  readonly chunks: T[];
}

export interface OversizedInputHandlerOptions {
  readonly maxInputTokens: number;
  readonly maxChunkLines?: number;
  /**
   * Tokens to hold back from `maxInputTokens` for text the provider prepends at
   * request time (the embedding document prefix). Without this the handler can
   * reduce a chunk to exactly the cap, and the prefix then pushes the real
   * request over it — the budgeter rejects it and the chunk is skipped anyway.
   */
  readonly reservedTokens?: number | undefined;
  /** Maximum token estimate across the actual provider-visible channels. */
  readonly estimateInputTokens?: ((chunk: CodeChunk) => number) | undefined;
}

/** Effective per-input budget once provider-added text is reserved for. */
function effectiveBudget(options: OversizedInputHandlerOptions): number {
  const reserved = options.reservedTokens ?? 0;
  // Never return a non-positive budget: a 1-token floor keeps reduction possible.
  return Math.max(1, options.maxInputTokens - reserved);
}

function fitsInputBudget(
  chunk: CodeChunk,
  options: OversizedInputHandlerOptions,
  contentBudget: number,
): boolean {
  if (options.estimateInputTokens !== undefined) {
    // The caller can measure the exact semantic/signature strings sent to the
    // provider. That is authoritative: a large raw body may be irrelevant when
    // enrichment supplies compact semantic text, while a small raw body may
    // gain enough metadata to exceed the provider limit.
    return options.estimateInputTokens(chunk) <= options.maxInputTokens;
  }
  return estimateProviderInputTokens(chunk.content) <= contentBudget;
}

function getRepoId(chunk: CodeChunk): string {
  const repoId = (chunk as ChunkWithRuntimeMetadata).repoId;
  return repoId ?? 'unknown';
}

function getSymbol(chunk: CodeChunk): string {
  return chunk.name ?? '<anonymous>';
}

function throwOversized(chunk: CodeChunk): never {
  throw new OversizedInputError(
    getRepoId(chunk),
    chunk.relativePath,
    getSymbol(chunk),
    chunk.startLine,
    chunk.endLine,
  );
}

function isLeadingDocumentationOrAnnotation(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('@') ||
    trimmed.startsWith('/**') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('//') ||
    trimmed.endsWith('*/')
  );
}

function hasStructuralOpeningBrace(line: string, inBlockComment: { value: boolean }): boolean {
  let quote: '"' | "'" | '`' | undefined;
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index]!;
    const next = line[index + 1];

    if (inBlockComment.value) {
      if (character === '*' && next === '/') {
        inBlockComment.value = false;
        index++;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '/' && next === '*') {
      inBlockComment.value = true;
      index++;
      continue;
    }
    if (character === '/' && next === '/') break;
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') return true;
  }
  return false;
}

/** Suffix the splitter appends to sub-chunk names (`Foo$part2`). */
const PART_SUFFIX_PATTERN = /\$part\d+$/;

/**
 * The name to look for in the source text. A split sub-chunk is named
 * `Foo$part2`, but the source only ever contains `Foo`, so the suffix must be
 * stripped before matching or the declaration is never found.
 */
function declarationName(name?: string): string | undefined {
  if (name == null) return undefined;
  const stripped = name.replace(PART_SUFFIX_PATTERN, '');
  return stripped.length > 0 ? stripped : undefined;
}

function extractSignatureOnly(content: string, name?: string): string | undefined {
  const lines = content.split('\n');
  const escapedName = declarationName(name)?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declarationPattern = escapedName
    ? new RegExp(`\\b${escapedName}\\b`)
    : undefined;
  const declarationKeywords = /(?:^|\s)(class|interface|enum|record|trait|module|object)\s+/;
  const methodDeclarationKeywords =
    /(?:^|\s)(function|public|private|protected|static|async|def|fn|fun)\s+/;
  let declarationLine = -1;

  // Prefer the parent type declaration, scanning from the beginning. A
  // backwards search can select an enum constructor or recursive method call
  // instead of `public enum Foo {` / `class Foo {`.
  if (declarationPattern) {
    declarationLine = lines.findIndex(
      (line) => declarationPattern.test(line) && declarationKeywords.test(line),
    );
    if (declarationLine === -1) {
      // Methods do not contain a type keyword; their first name-bearing line
      // is the declaration because the body follows it.
      declarationLine = lines.findIndex(
        (line) =>
          declarationPattern.test(line) &&
          line.includes('(') &&
          methodDeclarationKeywords.test(line),
      );
    }
  } else {
    declarationLine = lines.findIndex((line) => declarationKeywords.test(line));
  }

  if (declarationLine === -1) {
    const commentState = { value: false };
    declarationLine = lines.findIndex((line) => hasStructuralOpeningBrace(line, commentState));
  }
  if (declarationLine === -1) return undefined;

  let startLine = declarationLine;
  while (startLine > 0 && isLeadingDocumentationOrAnnotation(lines[startLine - 1]!)) {
    startLine--;
  }

  const commentState = { value: false };
  let signatureEndLine = declarationLine;
  for (let index = declarationLine; index < lines.length; index++) {
    if (hasStructuralOpeningBrace(lines[index]!, commentState)) {
      signatureEndLine = index;
      break;
    }
  }

  const signatureLines = lines.slice(startLine, signatureEndLine + 1);
  const declaration = signatureLines[signatureLines.length - 1]!;
  const braceIndex = declaration.indexOf('{');
  if (braceIndex !== -1) {
    signatureLines[signatureLines.length - 1] = declaration.slice(0, braceIndex + 1).trimEnd();
  }

  return signatureLines.join('\n').trim();
}

/**
 * Longest leading run of characters whose provider-input estimate fits the budget.
 * is non-decreasing in prefix length, so the boundary is found by binary search
 * rather than a per-character walk (content here can be tens of thousands of chars).
 * Operates on code points so surrogate pairs are never split.
 */
function longestPrefixWithinBudget(text: string, maxInputTokens: number): string {
  if (estimateProviderInputTokens(text) <= maxInputTokens) return text;
  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (estimateProviderInputTokens(characters.slice(0, mid).join('')) <= maxInputTokens) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return characters.slice(0, low).join('');
}

/**
 * Last-resort degradation for content with no extractable declaration (minified
 * blobs, generated data, SQL migrations). Keeps the leading lines that fit the
 * budget so the chunk stays in the index instead of being dropped entirely.
 * Whole lines are preferred; only when not even one line fits is the first line
 * reduced by characters.
 */
function headTruncate(content: string, maxInputTokens: number): string | undefined {
  const lines = content.split('\n');
  let kept = '';
  let keptLines = 0;
  for (const line of lines) {
    const candidate = keptLines === 0 ? line : `${kept}\n${line}`;
    if (estimateProviderInputTokens(candidate) > maxInputTokens) break;
    kept = candidate;
    keptLines++;
  }
  if (kept.trim().length > 0) return kept;

  const firstMeaningfulLine = lines.find((line) => line.trim().length > 0) ?? '';
  const reduced = longestPrefixWithinBudget(firstMeaningfulLine, maxInputTokens);
  return reduced.trim().length > 0 ? reduced : undefined;
}

function reducedChunk<T extends CodeChunk>(
  chunk: T,
  content: string,
  truncated = false,
): OversizedHandlingResult<T & { signatureOnly: true }> {
  return {
    mode: 'signature-only',
    chunks: [
      {
        ...chunk,
        content,
        signatureOnly: true,
        ...(truncated ? { truncated: true } : {}),
      } as T & { signatureOnly: true },
    ],
  };
}

function signatureOnlyChunk<T extends CodeChunk>(
  chunk: T,
  options: OversizedInputHandlerOptions,
): OversizedHandlingResult<T & { signatureOnly: true }> {
  const signature = extractSignatureOnly(chunk.content, chunk.name);
  if (signature) {
    // A real declaration exists: never replace it with arbitrary truncation.
    const reduced = reducedChunk(chunk, signature);
    if (!fitsInputBudget(reduced.chunks[0]!, options, effectiveBudget(options))) {
      throwOversized(chunk);
    }
    return reduced;
  }

  // No declaration at all. Degrade to a flagged head truncation rather than
  // dropping the chunk from the index; `signatureOnly` keeps it visible in the
  // pipeline's report.
  const truncated = headTruncate(chunk.content, effectiveBudget(options));
  if (!truncated) {
    throwOversized(chunk);
  }
  const reduced = reducedChunk(chunk, truncated);
  if (!fitsInputBudget(reduced.chunks[0]!, options, effectiveBudget(options))) {
    throwOversized(chunk);
  }
  return reducedChunk(chunk, truncated, truncated.length < chunk.content.length);
}

export function handleOversizedInput<T extends CodeChunk>(
  chunk: T,
  options: OversizedInputHandlerOptions,
): OversizedHandlingResult<T> {
  // Budget against the provider-visible request size (content + document prefix),
  // so a chunk reduced to exactly the cap is not rejected later by the budgeter.
  const budget = effectiveBudget(options);
  if (fitsInputBudget(chunk, options, budget)) {
    return { mode: 'unchanged', chunks: [chunk] };
  }

  // Only class chunks have AST method boundaries here. Other constructs must not be
  // mechanically line-split and then embedded as if the parts were semantic nodes.
  // Split only the original class construct. A splitter-generated part already
  // has source coordinates relative to the parent; splitting it again would
  // make its line range ambiguous. Its signature-only fallback is safe and
  // preserves the original source range.
  if (chunk.chunkType === 'class' && chunk.partIndex == null && chunk.parentStartLine == null) {
    const split = splitOversizedChunks([chunk], options.maxChunkLines);
    const splitFits = split.length > 1 && split.every((part) => fitsInputBudget(part, options, budget));
    if (splitFits) {
      return { mode: 'split', chunks: split as T[] };
    }
  }

  return signatureOnlyChunk(chunk, options) as OversizedHandlingResult<T>;
}

export class OversizedInputHandler {
  constructor(private readonly options: OversizedInputHandlerOptions) {}

  handle<T extends CodeChunk>(chunk: T): OversizedHandlingResult<T> {
    return handleOversizedInput(chunk, this.options);
  }
}
