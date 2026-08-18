import type { ContextItem, LineRange, QueryIntent, SourceAnchor } from '@ia-framework/core';
import type { RetrievalResult } from '@ia-framework/retrieval';

export function selectRange(result: RetrievalResult, intent: QueryIntent): LineRange {
  if (intent === 'exact_symbol') {
    const starts = [result.docCommentStartLine, result.annotationStartLine, result.startLine].filter(
      (line): line is number => line !== undefined,
    );
    return { startLine: Math.min(...starts), endLine: result.endLine };
  }

  return { startLine: result.startLine, endLine: result.endLine };
}

function expandedRange(result: RetrievalResult): LineRange {
  return selectRange(result, 'exact_symbol');
}

export function deduplicateResults(results: RetrievalResult[]): RetrievalResult[] {
  const seen = new Set<string>();
  const output: RetrievalResult[] = [];
  for (const result of results) {
    const range = expandedRange(result);
    const rangeKey = `${result.repoId ?? ''}:${result.relativePath}:${range.startLine}:${range.endLine}`;
    const key = result.chunkId || rangeKey;
    const duplicateIndex = output.findIndex((item) => {
      const itemRange = expandedRange(item);
      const itemRangeKey = `${item.repoId ?? ''}:${item.relativePath}:${itemRange.startLine}:${itemRange.endLine}`;
      return (
        item.chunkId === result.chunkId ||
        itemRangeKey === rangeKey ||
        (item.content === '' &&
          result.content === '' &&
          item.repoId === result.repoId &&
          item.relativePath === result.relativePath)
      );
    });
    if (seen.has(key) || duplicateIndex >= 0) {
      continue;
    }

    const overlapIndex = output.findIndex((item) => {
      if (item.repoId !== result.repoId || item.relativePath !== result.relativePath) return false;
      const itemRange = expandedRange(item);
      return range.startLine <= itemRange.endLine && itemRange.startLine <= range.endLine;
    });
    if (overlapIndex >= 0) {
      const existing = output[overlapIndex]!;
      output[overlapIndex] = {
        ...existing,
        startLine: Math.min(existing.startLine, result.startLine),
        endLine: Math.max(existing.endLine, result.endLine),
        ...(existing.docCommentStartLine === undefined
          ? result.docCommentStartLine === undefined
            ? {}
            : { docCommentStartLine: result.docCommentStartLine }
          : result.docCommentStartLine === undefined
            ? {}
            : { docCommentStartLine: Math.min(existing.docCommentStartLine, result.docCommentStartLine) }),
        ...(existing.annotationStartLine === undefined
          ? result.annotationStartLine === undefined
            ? {}
            : { annotationStartLine: result.annotationStartLine }
          : result.annotationStartLine === undefined
            ? {}
            : { annotationStartLine: Math.min(existing.annotationStartLine, result.annotationStartLine) }),
      };
      continue;
    }
    seen.add(key);
    output.push(result);
  }
  return output;
}

function anchorFor(result: RetrievalResult, range: LineRange): SourceAnchor {
  return {
    ...(result.repoId === undefined ? {} : { repoId: result.repoId }),
    relativePath: result.relativePath,
    ...(result.name === undefined ? {} : { symbol: result.name }),
    startLine: range.startLine,
    endLine: range.endLine,
  };
}

export class ContextAssembler {
  toContextItem(result: RetrievalResult, intent: QueryIntent, query = ''): ContextItem {
    const range = selectRange(result, intent);
    const text = renderText(result, intent, query);
    const form = formFor(result, intent, text);
    const provenance: ContextItem['provenance'] = {
      ...(result.matchedVector === 'semantic' ||
      result.matchedVector === 'signature' ||
      result.matchedVector === 'sparse'
        ? { branch: result.matchedVector }
        : {}),
      ...(result.expansionSource ? { expansionSource: result.expansionSource } : {}),
      ...(result.source ? { collection: result.source } : {}),
    };
    return {
      priority: priorityFor(result, intent, form),
      anchor: anchorFor(result, range),
      form,
      range,
      ...(text === undefined ? {} : { text }),
      provenance,
      ...(result.stale === undefined ? {} : { stale: result.stale }),
      ...(result.signatureOnly === undefined ? {} : { signatureOnly: result.signatureOnly }),
    };
  }

  assemble(results: RetrievalResult[], intent: QueryIntent, query = ''): ContextItem[] {
    return deduplicateResults(results).map((result) => this.toContextItem(result, intent, query));
  }
}

/**
 * CTX-08 / ENR-04: dependency, hierarchy, call-chain and adjacent evidence is
 * periphery, so it defaults to compact form regardless of score — anchor +
 * signature + a one-line enrichment description (`context.md` decision 5). The
 * anchor itself is rendered by the response formatter, so the text carries the
 * signature and the description line. A missing description is omitted
 * entirely: no empty field, no placeholder (ENR-08).
 */
function renderExpansionEvidence(result: RetrievalResult): string {
  const signature = result.signature ?? result.classSignature;
  return [signature, result.enrichment?.description]
    .filter((line): line is string => line !== undefined && line !== '')
    .join('\n');
}

function renderText(result: RetrievalResult, intent: QueryIntent, query: string): string | undefined {
  if (intent === 'existence' || intent === 'aggregation') return undefined;
  if (intent === 'dependency_trace') {
    return `${result.imports.join(', ')}${result.signature ? `\n${result.signature}` : ''}`;
  }
  if (intent === 'class_overview') return renderClassOverview(result, query);
  if (result.expansionSource) return renderExpansionEvidence(result);

  // ENR-07 / A-11: exact source wins whenever it exists, on EVERY intent —
  // enrichment must never displace code the caller asked to see. When exact
  // source is unavailable the item degrades deterministically to its signature
  // (marked via `form`). Only when neither source nor signature exists is the
  // enrichment description legitimate compact context (ENR-03: "when full source
  // is not necessary to answer, enrichment is usable as compact context in its
  // place"), and its absence degrades to empty rather than a placeholder
  // (ENR-08, context.md decision 5).
  //
  // stripImportLines applies to every non-dependency intent, at every score: the
  // import block is high-token, low-signal on the ordinary search path, and
  // `get_dependencies` already exposes the edge graph (context.md decision 3).
  if (result.content) return stripImportLines(result.content);
  if (result.signature) return result.signature;
  return result.enrichment?.description ?? '';
}

function formFor(
  result: RetrievalResult,
  intent: QueryIntent,
  text: string | undefined,
): ContextItem['form'] {
  if (text === undefined) return 'anchor-only';
  if (intent === 'class_overview' || intent === 'dependency_trace') return 'signature';
  // CTX-08 / ENR-04: expansion evidence is compact by form, not by score. This
  // mirrors priorityFor, which already ranks expansion evidence below direct
  // results — form and priority must not disagree.
  if (result.expansionSource) {
    if (result.signature ?? result.classSignature) return 'signature';
    return text === '' ? 'anchor-only' : 'summary';
  }
  // ENR-07: exact source present → source. Without it the item degrades to a
  // marked signature; with neither, the enrichment description is a summary.
  if (result.content) return 'source';
  if (result.signature) return 'signature';
  return 'summary';
}

function priorityFor(
  result: RetrievalResult,
  intent: QueryIntent,
  form: ContextItem['form'],
): ContextItem['priority'] {
  if (intent === 'existence' || intent === 'aggregation') return 7;
  if (result.expansionSource === 'adjacent' || result.expansionSource === 'call-chain') return 6;
  if (result.expansionSource) return 5;
  if (intent === 'exact_symbol') return 1;
  if (form === 'source' && result.score >= 0.75) return 2;
  if (form === 'summary') return 4;
  return 3;
}

function stripImportLines(content: string): string {
  return content
    .split('\n')
    .filter((line) => !/^\s*(?:import|from\s+.+\s+import)\b/.test(line))
    .join('\n');
}

/**
 * Render a class overview: the declaration line (including extends/implements),
 * then the field block, then method **signatures with no bodies**
 * (`context.md` decision 3). Bodies appear only for members the query
 * specifically implicates.
 *
 * Brace depth is tracked so only class-member-level lines are considered. The
 * previous line-shape heuristic admitted any line ending in `;` without `(`,
 * which emitted body statements such as `return id;` and `this.amount = a;`
 * after the signature.
 */
function renderClassOverview(result: RetrievalResult, query: string): string {
  const lines = result.content.split('\n');
  const declaration = result.classSignature ?? lines.find((line) => /\b(class|interface|enum)\b/.test(line));
  const queryTerms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 1);
  const rendered: string[] = declaration ? [declaration.trim()] : [];
  const braceDelta = (line: string): number =>
    (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length;

  let depth = 0;
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index]!;
    const line = raw.trim();
    const depthBefore = depth;
    depth += braceDelta(raw);

    if (!line || line === declaration?.trim()) continue;
    // Only class-member level is part of an overview. Anything deeper is a body.
    if (depthBefore !== 1) continue;

    // Field declarations and bodyless signatures (interface/abstract members)
    // are already declaration-only — emit verbatim.
    if (/;\s*$/.test(line)) {
      rendered.push(line);
      continue;
    }

    if (!line.includes('(') || /^(if|for|while|switch|catch)\b/.test(line)) continue;

    const methodName = line.match(/([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/)?.[1]?.toLowerCase();
    const implicated =
      result.score >= 0.75 &&
      methodName !== undefined &&
      queryTerms.some((term) => methodName.includes(term) || term.includes(methodName));

    // Consume the member's whole body either way, so its statements can never
    // fall through to the class-member branch above.
    const block: string[] = [raw];
    let blockDepth = braceDelta(raw);
    while (blockDepth > 0 && index + 1 < lines.length) {
      index++;
      block.push(lines[index]!);
      blockDepth += braceDelta(lines[index]!);
      depth += braceDelta(lines[index]!);
    }

    rendered.push(implicated ? block.join('\n') : line.split('{')[0]!.trim());
  }

  return rendered.join('\n');
}
