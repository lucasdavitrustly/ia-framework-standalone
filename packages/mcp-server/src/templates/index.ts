/**
 * RAG-to-action prompt template system.
 * Provides intent detection and template lookup for search query scaffolding.
 */

export { detectIntent } from './intent-detector.js';
export type { IntentType } from './intent-detector.js';
export { getTemplate, TEMPLATES } from './registry.js';
export { IMPACT_ANALYSIS_TEMPLATE } from './impact-analysis.js';
export { DEPENDENCY_TRACE_TEMPLATE } from './dependency-trace.js';
