import type { CodeChunk } from './types.js';
import type { Stereotype, ArchLayer } from '@ia-framework/core';

/**
 * T022: Stereotype classifier
 *
 * Assigns heuristic stereotype and architectural layer to a code chunk
 * based on positive evidence: annotations, name suffixes, superclass names.
 *
 * Rules are annotation-first (highest confidence), then name-suffix fallback.
 * Only sets stereotype when positive evidence exists — never guesses.
 */

export interface ClassificationResult {
  stereotype: Stereotype;
  archLayer?: ArchLayer | undefined;
}

// ── Annotation → (stereotype, archLayer) map ─────────────────────────────────

/** Spring / Guice / framework annotations mapped to stereotype + arch layer. */
const ANNOTATION_RULES: Array<{
  annotations: string[];
  stereotype: Stereotype;
  archLayer?: ArchLayer | undefined;
}> = [
  // Presentation layer
  {
    annotations: ['@RestController', '@Controller', '@RequestMapping'],
    stereotype: 'controller',
    archLayer: 'presentation',
  },
  // Service layer
  {
    annotations: ['@Service', '@ApplicationService', '@Singleton', '@Named'],
    stereotype: 'service',
    archLayer: 'service',
  },
  // Persistence layer
  {
    annotations: ['@Repository', '@Dao'],
    stereotype: 'repository',
    archLayer: 'persistence',
  },
  // Domain layer
  {
    annotations: ['@Entity', '@MappedSuperclass', '@Embeddable', '@Table'],
    stereotype: 'entity',
    archLayer: 'domain',
  },
  // Crosscutting
  {
    annotations: ['@Aspect'],
    stereotype: 'aspect',
    archLayer: 'crosscutting',
  },
  // Infrastructure / client
  {
    annotations: ['@FeignClient', '@HttpClient'],
    stereotype: 'client',
    archLayer: 'infrastructure',
  },
  // Cross-cutting concern annotations
  {
    annotations: ['@ControllerAdvice', '@RestControllerAdvice'],
    stereotype: 'exception-handler',
    archLayer: 'crosscutting',
  },
  {
    annotations: ['@Scheduled', '@EnableScheduling'],
    stereotype: 'scheduler',
    archLayer: 'crosscutting',
  },
  {
    annotations: ['@EventListener', '@TransactionalEventListener'],
    stereotype: 'event-listener',
    archLayer: 'crosscutting',
  },
  {
    annotations: ['@Validated', '@Valid'],
    stereotype: 'validator',
    archLayer: 'crosscutting',
  },
  {
    annotations: ['@WebFilter', '@Filter', '@HandlerInterceptor'],
    stereotype: 'filter',
    archLayer: 'crosscutting',
  },
  // DTO / data-transfer markers (Lombok)
  {
    annotations: ['@Data', '@Value', '@Builder', '@Record'],
    stereotype: 'dto',
    archLayer: 'domain',
  },
  // Gateway / adapter
  {
    annotations: ['@GatewayClient', '@Adapter'],
    stereotype: 'gateway',
    archLayer: 'infrastructure',
  },
  // Configuration
  {
    annotations: ['@Configuration', '@EnableAutoConfiguration'],
    stereotype: 'config',
    archLayer: 'crosscutting',
  },
  // Mapper (MapStruct, ModelMapper)
  {
    annotations: ['@Mapper', '@MapperConfig'],
    stereotype: 'mapper',
    archLayer: 'domain',
  },
  // Test annotations
  {
    annotations: ['@Test', '@SpringBootTest', '@DataJpaTest', '@WebMvcTest'],
    stereotype: 'test',
  },
];

// ── Name-suffix fallback rules ────────────────────────────────────────────────

/** Name suffix → (stereotype, archLayer) for when no annotations are present. */
const NAME_RULES: Array<{
  suffixes: string[];
  stereotype: Stereotype;
  archLayer?: ArchLayer | undefined;
}> = [
  {
    suffixes: ['Controller', 'Resource', 'Endpoint'],
    stereotype: 'controller',
    archLayer: 'presentation',
  },
  {
    suffixes: ['Service', 'ServiceImpl', 'UseCase', 'Interactor'],
    stereotype: 'service',
    archLayer: 'service',
  },
  {
    suffixes: ['Repository', 'RepositoryImpl', 'Dao', 'DaoImpl'],
    stereotype: 'repository',
    archLayer: 'persistence',
  },
  { suffixes: ['Entity', 'Record'], stereotype: 'entity', archLayer: 'domain' },
  {
    suffixes: ['Dto', 'DTO', 'Request', 'Response', 'Payload'],
    stereotype: 'dto',
    archLayer: 'domain',
  },
  { suffixes: ['Mapper', 'Converter', 'Transformer'], stereotype: 'mapper', archLayer: 'domain' },
  {
    suffixes: ['Config', 'Configuration', 'Settings'],
    stereotype: 'config',
    archLayer: 'crosscutting',
  },
  {
    suffixes: ['Client', 'HttpClient', 'ApiClient', 'RestClient'],
    stereotype: 'client',
    archLayer: 'infrastructure',
  },
  { suffixes: ['Gateway', 'Adapter', 'Proxy'], stereotype: 'gateway', archLayer: 'infrastructure' },
  {
    suffixes: ['Filter', 'Interceptor', 'Listener', 'Aspect'],
    stereotype: 'filter',
    archLayer: 'crosscutting',
  },
  { suffixes: ['Validator', 'Validation'], stereotype: 'validator', archLayer: 'crosscutting' },
  { suffixes: ['Test', 'Tests', 'Spec', 'IT'], stereotype: 'test' },
  {
    suffixes: ['Scheduler', 'Job', 'Task', 'Cron'],
    stereotype: 'scheduler',
    archLayer: 'crosscutting',
  },
];

// ── Core classify function ────────────────────────────────────────────────────

/**
 * Classify a code chunk based on annotations (primary) and name suffix (fallback).
 * Returns stereotype='unknown' when no positive evidence is found.
 */
export function classify(chunk: CodeChunk): ClassificationResult {
  const annotations = chunk.annotations ?? [];
  const name = chunk.name ?? '';

  // 1. Annotation-first: check each rule in priority order
  for (const rule of ANNOTATION_RULES) {
    for (const ruleAnnotation of rule.annotations) {
      for (const chunkAnnotation of annotations) {
        // Strip parameter part: @FeignClient(name="foo") → @FeignClient
        const normalized = chunkAnnotation.replace(/\(.*$/, '').trim();
        if (normalized === ruleAnnotation) {
          const result: ClassificationResult = { stereotype: rule.stereotype };
          if (rule.archLayer) result.archLayer = rule.archLayer;
          return result;
        }
      }
    }
  }

  // 2. @Component fallback: classify as service (generic component)
  const hasComponent = annotations.some((a) => a.replace(/\(.*$/, '').trim() === '@Component');
  if (hasComponent) {
    return { stereotype: 'service', archLayer: 'service' };
  }

  // 3. Name-suffix fallback (only when chunk is a class-level construct)
  if (name) {
    for (const rule of NAME_RULES) {
      for (const suffix of rule.suffixes) {
        if (name.endsWith(suffix)) {
          const result: ClassificationResult = { stereotype: rule.stereotype };
          if (rule.archLayer) result.archLayer = rule.archLayer;
          return result;
        }
      }
    }
  }

  return { stereotype: 'unknown' };
}
