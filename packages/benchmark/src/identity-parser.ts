import type { IdentityInfo } from './types.js';

/**
 * Parses an LLM-IDENTITY block from a response string.
 *
 * Expected format:
 * ---LLM-IDENTITY---
 * Model: <model name>
 * Provider: <provider name>
 * Temperature: <temperature>
 * ---END-IDENTITY---
 *
 * @returns IdentityInfo with extracted fields (null for missing fields), or null if no block found.
 */
export function parseIdentityBlock(responseText: string): IdentityInfo | null {
  const blockMatch = /---LLM-IDENTITY---\s*\n([\s\S]*?)---END-IDENTITY---/.exec(responseText);
  if (!blockMatch) return null;

  const block = blockMatch[1]!;

  const modelMatch = /^Model:\s*(.+?)\s*$/im.exec(block);
  const providerMatch = /^Provider:\s*(.+?)\s*$/im.exec(block);
  const temperatureMatch = /^Temperature:\s*(.+?)\s*$/im.exec(block);

  return {
    model: modelMatch ? modelMatch[1]! : null,
    provider: providerMatch ? providerMatch[1]! : null,
    temperature: temperatureMatch ? temperatureMatch[1]! : null,
  };
}

/**
 * Compares parsed model identity against the configured model name.
 * Comparison is case-insensitive and allows partial (substring) matching
 * in either direction.
 *
 * @returns true if models match (same, case-insensitive, or one is substring of the other)
 */
export function compareModelIdentity(parsedModel: string, configuredModel: string): boolean {
  if (!parsedModel.trim() || !configuredModel.trim()) return false;
  const parsed = parsedModel.toLowerCase();
  const configured = configuredModel.toLowerCase();
  return parsed === configured || parsed.includes(configured) || configured.includes(parsed);
}
