/**
 * Cross-Cutting Concept Generator
 *
 * Detects cross-cutting concerns spread across the codebase and generates
 * synthetic "aspect" chunks that aggregate references. This helps RAG retrieval
 * surface patterns like error handling, encryption, locking, and transaction
 * management that span many files.
 *
 * Generated chunks use chunkType: 'aspect' and are stored alongside regular chunks.
 */

import type { CodeChunk } from '@ia-framework/ast-parser';

/** Extended chunk with runtime enrichment metadata (from pipeline) */
export interface EnrichedChunk extends CodeChunk {
  layerHints?: string[];
}

export interface ConceptPattern {
  /** Unique identifier for this concept */
  id: string;
  /** Human-readable label */
  label: string;
  /** Patterns to match in chunk content */
  contentPatterns: RegExp[];
  /** Patterns to match in chunk names */
  namePatterns?: RegExp[];
  /** Layer hints that indicate this concern */
  layerHints?: string[];
}

export interface DetectedConcept {
  pattern: ConceptPattern;
  /** Chunks that match this concept */
  chunks: EnrichedChunk[];
}

export interface ConceptChunk {
  /** Synthetic chunk representing the concept */
  chunk: CodeChunk;
  /** Number of source chunks aggregated */
  sourceCount: number;
}

/**
 * Default cross-cutting patterns to detect.
 * These are common architectural concerns that span multiple files.
 */
export const DEFAULT_PATTERNS: ConceptPattern[] = [
  {
    id: 'error-handling',
    label: 'Error Handling',
    contentPatterns: [
      /catch\s*\(/,
      /throw\s+new\s+\w*Exception/,
      /ExceptionHandler|ControllerAdvice/,
      /\.error\(|\.warn\(/,
    ],
    namePatterns: [/exception/i, /error/i, /handler/i],
  },
  {
    id: 'encryption-security',
    label: 'Encryption & Security',
    contentPatterns: [
      /encrypt|decrypt|cipher|Signature\./,
      /SecretKey|PrivateKey|PublicKey/,
      /BCrypt|hash|digest|HMAC/i,
      /@Secured|@PreAuthorize|SecurityConfig/,
    ],
    namePatterns: [/security/i, /auth/i, /crypto/i, /encrypt/i],
  },
  {
    id: 'persistence-patterns',
    label: 'Persistence & Data Access',
    contentPatterns: [
      /optimistic.?lock|record_version|@Version/i,
      /JdbcTemplate|NamedParameterJdbc/,
      /@Transactional|BEGIN|COMMIT|ROLLBACK/,
      /INSERT\s+INTO|UPDATE\s+\w+\s+SET/i,
    ],
    layerHints: ['repository'],
  },
  {
    id: 'retry-resilience',
    label: 'Retry & Resilience',
    contentPatterns: [
      /@Retry|@CircuitBreaker|Resilience4j/,
      /RetryTemplate|BackOff|maxAttempts/,
      /NonRetriable|NonRetryable/,
      /fallback|circuitBreaker/i,
    ],
    namePatterns: [/retry/i, /resilience/i, /fallback/i],
  },
  {
    id: 'event-messaging',
    label: 'Event & Messaging',
    contentPatterns: [
      /EventBus|EventPublisher|publishEvent/,
      /RabbitMQ|ActiveMQ|JmsTemplate/i,
      /@EventListener|@RabbitListener|@JmsListener/,
      /IntegrationEvent|DomainEvent/,
    ],
    namePatterns: [/event/i, /listener/i, /publisher/i],
  },
  {
    id: 'validation',
    label: 'Validation & Business Rules',
    contentPatterns: [
      /@Valid|@NotNull|@NotBlank|@Size/,
      /BusinessRule|Validator|validate\(/,
      /checkStatus|guardAgainst|precondition/i,
    ],
    namePatterns: [/validat/i, /rule/i],
  },
];

/**
 * Detect cross-cutting concepts across all chunks.
 * Returns only concepts with 3+ matching chunks (too few = not cross-cutting).
 */
export function detectConcepts(
  chunks: EnrichedChunk[],
  patterns: ConceptPattern[] = DEFAULT_PATTERNS,
  minChunks = 3,
): DetectedConcept[] {
  const detected: DetectedConcept[] = [];

  for (const pattern of patterns) {
    const matching = chunks.filter((chunk) => matchesPattern(chunk, pattern));

    if (matching.length >= minChunks) {
      detected.push({ pattern, chunks: matching });
    }
  }

  return detected;
}

function matchesPattern(chunk: EnrichedChunk, pattern: ConceptPattern): boolean {
  // Check content patterns
  for (const regex of pattern.contentPatterns) {
    if (regex.test(chunk.content)) return true;
  }

  // Check name patterns
  if (pattern.namePatterns && chunk.name) {
    for (const regex of pattern.namePatterns) {
      if (regex.test(chunk.name)) return true;
    }
  }

  // Check layer hints
  if (pattern.layerHints && chunk.layerHints) {
    for (const hint of pattern.layerHints) {
      if (chunk.layerHints.includes(hint)) return true;
    }
  }

  return false;
}

/**
 * Generate synthetic "aspect" chunks from detected concepts.
 * Each concept becomes one chunk with aggregated references.
 */
export function generateConceptChunks(
  concepts: DetectedConcept[],
  projectRoot: string,
): ConceptChunk[] {
  return concepts.map((concept) => {
    const { pattern, chunks } = concept;

    // Group by file for a summary
    const byFile = new Map<string, CodeChunk[]>();
    for (const chunk of chunks) {
      const path = chunk.relativePath ?? chunk.filePath;
      const existing = byFile.get(path) ?? [];
      existing.push(chunk);
      byFile.set(path, existing);
    }

    // Build synthetic content
    const lines: string[] = [
      `// Cross-cutting concept: ${pattern.label}`,
      `// This pattern appears in ${chunks.length} locations across ${byFile.size} files.`,
      `//`,
      `// Files involved:`,
    ];

    // List files with their relevant constructs (max 20 files shown)
    const fileEntries = [...byFile.entries()].slice(0, 20);
    for (const [filePath, fileChunks] of fileEntries) {
      const names = fileChunks
        .filter((c) => c.name)
        .map((c) => c.name)
        .slice(0, 5);
      const namesStr = names.length > 0 ? ` (${names.join(', ')})` : '';
      lines.push(`//   - ${filePath}${namesStr}`);
    }
    if (byFile.size > 20) {
      lines.push(`//   ... and ${byFile.size - 20} more files`);
    }

    lines.push('//');
    lines.push(`// Key patterns detected:`);
    for (const regex of pattern.contentPatterns) {
      lines.push(`//   - ${regex.source}`);
    }

    // Include a representative snippet from the top 3 most relevant chunks
    lines.push('');
    lines.push(`// Representative examples:`);
    const examples = chunks.slice(0, 3);
    for (const example of examples) {
      const loc = example.relativePath ?? example.filePath;
      lines.push(`// --- ${loc}:${example.startLine} (${example.name ?? 'anonymous'}) ---`);
      // Include first 10 lines of each example
      const snippet = example.content.split('\n').slice(0, 10).join('\n');
      lines.push(snippet);
      lines.push('');
    }

    const content = lines.join('\n');

    const conceptChunk: CodeChunk = {
      id: `concept-${pattern.id}`,
      filePath: `${projectRoot}/.concepts/${pattern.id}.concept`,
      relativePath: `.concepts/${pattern.id}.concept`,
      language: chunks[0]?.language ?? 'java',
      chunkType: 'aspect',
      name: `concept:${pattern.id}`,
      content,
      startLine: 1,
      endLine: lines.length,
      imports: [],
      exports: [],
    };

    return { chunk: conceptChunk, sourceCount: chunks.length };
  });
}
