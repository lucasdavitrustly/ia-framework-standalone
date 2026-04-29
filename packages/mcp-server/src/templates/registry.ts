/**
 * Template registry mapping detected intents to prompt template strings.
 */

import type { IntentType } from './intent-detector.js';
import { IMPACT_ANALYSIS_TEMPLATE } from './impact-analysis.js';
import { DEPENDENCY_TRACE_TEMPLATE } from './dependency-trace.js';

export const TEMPLATES: ReadonlyMap<IntentType, string> = new Map<IntentType, string>([
  ['impact-analysis', IMPACT_ANALYSIS_TEMPLATE],
  ['dependency-trace', DEPENDENCY_TRACE_TEMPLATE],
]);

/**
 * Get the prompt template for a detected intent.
 * Returns undefined if intent is null or not found in the registry.
 */
export function getTemplate(intent: IntentType | null): string | undefined {
  if (intent === null) return undefined;
  return TEMPLATES.get(intent);
}
