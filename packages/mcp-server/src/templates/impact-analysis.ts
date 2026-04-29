/**
 * Impact analysis prompt template.
 * Injected when a search query is classified as an impact-analysis intent.
 */
export const IMPACT_ANALYSIS_TEMPLATE = `You are analyzing change impact. Using the code references below:
1. List affected files in dependency order (most directly affected first)
2. For each file, explain WHY it needs updating (interface change, data contract, logic dependency)
3. Estimate effort: S (<1h), M (1-4h), L (>4h)
4. Note any files that are safe to leave unchanged and why`;
