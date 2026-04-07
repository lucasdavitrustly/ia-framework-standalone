/**
 * Minimal structural type for chunks accepted by chunkToDescription().
 * Compatible with both CodeChunk (@ia-framework/ast-parser) and
 * ChunkMetadata (@ia-framework/core) — the function uses only these fields.
 */
interface ChunkLike {
  relativePath: string;
  language: string;
  chunkType: string;
  name?: string | undefined;
  parentName?: string | undefined;
  exports: string[];
  imports: string[];
}

/**
 * Generate a natural-language prose description of a code chunk for text embedding.
 *
 * NLP embedding models (nomic-embed-text, text-embedding-ada-002) are trained on prose
 * and cannot semantically match queries against raw code syntax. This function converts
 * structured chunk metadata into a sentence that NLP models can embed meaningfully.
 *
 * The codeVector embeds raw chunk.content (good for identifier matching).
 * The textVector embeds this description (good for semantic concept matching).
 */
export function chunkToDescription(chunk: ChunkLike): string {
  const parts: string[] = [];
  const file = chunk.relativePath;
  const lang = chunk.language;

  switch (chunk.chunkType) {
    case 'function':
      parts.push(`${lang} function ${chunk.name ?? 'anonymous'} in ${file}`);
      break;
    case 'class':
      parts.push(`${lang} class ${chunk.name ?? 'anonymous'} in ${file}`);
      break;
    case 'interface':
      parts.push(`TypeScript interface ${chunk.name ?? 'anonymous'} in ${file}`);
      break;
    case 'type':
      parts.push(`TypeScript type alias ${chunk.name ?? 'anonymous'} in ${file}`);
      break;
    case 'enum':
      parts.push(`${lang} enum ${chunk.name ?? 'anonymous'} in ${file}`);
      break;
    case 'module':
      parts.push(`${lang} module file ${file}`);
      break;
    default:
      parts.push(`${lang} code in ${file}`);
  }

  if (chunk.parentName) {
    parts.push(`inside ${chunk.parentName}`);
  }

  if (chunk.exports.length > 0) {
    parts.push(`exports: ${chunk.exports.slice(0, 5).join(', ')}`);
  }

  if (chunk.imports.length > 0) {
    const importedModules = chunk.imports
      .slice(0, 5)
      .map((i) => i.split('/').pop() ?? i)
      .join(', ');
    parts.push(`imports from: ${importedModules}`);
  }

  return parts.join('. ') + '.';
}
