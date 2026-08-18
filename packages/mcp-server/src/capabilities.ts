/**
 * Server capabilities & degradation tracking.
 *
 * Captures which optional features are available after startup (based on which
 * SQLite backend loaded and whether repo paths validated) and provides a helper
 * to surface degradation to callers via tool-response `structuredContent`.
 */

import type { SqliteBackend } from '@ia-framework/core';

/** Runtime capabilities snapshot, computed once at startup. */
export interface ServerCapabilities {
  /** Which SQLite backend was selected, or 'none' if unavailable. */
  sqliteBackend: SqliteBackend | 'none';
  /** Whether the dependency graph (search expansion) is available. */
  dependencyGraphAvailable: boolean;
  /** Whether metrics collection is available. */
  metricsStoreAvailable: boolean;
  /** Detected runtime version, e.g. "26.0.0". */
  runtimeVersion: string;
  /** Human-readable reasons for degraded features (empty when fully operational). */
  degradedReasons: string[];
  /** Machine-readable identifiers of unavailable features. */
  degradedFeatures: string[];
}

/** Build an initial fully-operational capabilities object. */
export function createCapabilities(runtimeVersion: string): ServerCapabilities {
  return {
    sqliteBackend: 'none',
    dependencyGraphAvailable: false,
    metricsStoreAvailable: false,
    runtimeVersion,
    degradedReasons: [],
    degradedFeatures: [],
  };
}

/** True when any optional feature is unavailable. */
export function isDegraded(caps: ServerCapabilities): boolean {
  return caps.degradedFeatures.length > 0;
}

/** Overall server mode label for logging. */
export function serverMode(caps: ServerCapabilities): 'FULL' | 'DEGRADED' {
  return isDegraded(caps) ? 'DEGRADED' : 'FULL';
}

/**
 * Merge degradation metadata into a tool response's structuredContent.
 *
 * Only adds `warnings`/`degraded_features` when something is actually degraded,
 * so normal full-functionality responses are unchanged. Existing structured
 * content fields are preserved.
 */
export function withDegradation(
  structuredContent: Record<string, unknown> | undefined,
  caps: ServerCapabilities | undefined,
): Record<string, unknown> | undefined {
  if (!caps || !isDegraded(caps)) return structuredContent;
  const base = structuredContent ?? {};
  return {
    ...base,
    status: 'unavailable',
    warnings: caps.degradedReasons,
    degraded_features: caps.degradedFeatures,
  };
}
