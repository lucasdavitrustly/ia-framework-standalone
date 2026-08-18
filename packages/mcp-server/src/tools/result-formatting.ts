interface FormattableRetrievalResult {
  relativePath: string;
  startLine: number;
  endLine: number;
  name?: string | undefined;
  repoId?: string | undefined;
  modulePath?: string | undefined;
  packageName?: string | undefined;
  layerHints?: string[] | undefined;
  expansionRepo?: string | undefined;
  parentName?: string | undefined;
  parentStartLine?: number | undefined;
  parentEndLine?: number | undefined;
  partIndex?: number | undefined;
  totalParts?: number | undefined;
  truncated?: boolean | undefined;
}

export function isValidLineRange(
  startLine: number | undefined,
  endLine: number | undefined,
): startLine is number {
  return (
    typeof startLine === 'number' &&
    typeof endLine === 'number' &&
    Number.isInteger(startLine) &&
    Number.isInteger(endLine) &&
    startLine >= 1 &&
    endLine >= startLine
  );
}

export function buildCodeAnchor(result: {
  relativePath: string;
  startLine: number;
  endLine: number;
  name?: string | undefined;
  repoId?: string | undefined;
  expansionRepo?: string | undefined;
}): string {
  const lines = `${result.startLine}-${result.endLine}`;
  const repoPrefix = result.repoId ? `[${result.repoId}] ` : '';
  const viaSuffix =
    result.expansionRepo && result.expansionRepo !== result.repoId
      ? ` [via ${result.expansionRepo}]`
      : '';
  return result.name
    ? `${repoPrefix}${result.relativePath}:${lines} (${result.name})${viaSuffix}`
    : `${repoPrefix}${result.relativePath}:${lines}${viaSuffix}`;
}

export function formatRetrievalContext(result: FormattableRetrievalResult): string {
  const hasPartMetadata =
    Number.isInteger(result.partIndex) &&
    result.partIndex! >= 1 &&
    Number.isInteger(result.totalParts) &&
    result.totalParts! >= result.partIndex!;
  const constructName = result.parentName ?? result.name;
  const hasParentRange = isValidLineRange(result.parentStartLine, result.parentEndLine);
  const constructLine =
    hasPartMetadata && constructName
      ? `Construct: ${constructName} (${hasParentRange ? `lines ${result.parentStartLine}-${result.parentEndLine}, ` : ''}part ${result.partIndex}/${result.totalParts}).${
          hasParentRange && result.parentName
            ? ` Use get_file(path=${JSON.stringify(result.repoId ? `${result.repoId}:${result.relativePath}` : result.relativePath)}, name=${JSON.stringify(result.parentName)}) to retrieve the complete construct.`
            : ''
        }`
      : '';

  return [
    `Anchor: ${buildCodeAnchor(result)}`,
    constructLine,
    result.modulePath ? `Module: ${result.modulePath}` : '',
    result.packageName ? `Package: ${result.packageName}` : '',
    result.layerHints?.length ? `Layers: ${result.layerHints.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}
