# Contract: Tool Response Metadata Extension

## Purpose

Defines the extended `structuredContent` contract for MCP tool responses when the server operates in degraded mode.

## Schema

All tool responses (`get_file`, `search_codebase`, `get_dependencies`) include `structuredContent` with these additional optional fields:

```typescript
interface ToolResponseStructuredContent {
  // Existing fields (preserved, not modified)
  answered?: boolean;
  fallbackUsed?: boolean;
  cached?: boolean;
  route?: string;
  // ... other existing fields

  // NEW: Degradation metadata
  warnings?: string[];
  degraded_features?: string[];
}
```

## Field Definitions

### `warnings`

- **Type**: `string[]` (optional)
- **When present**: At least one feature is degraded or a non-fatal issue occurred
- **Content**: Human-readable messages suitable for surfacing to the developer via their AI assistant
- **Examples**:
  - `"Dependency graph expansion unavailable: native database addon not compatible with current runtime (Node 26.0.0). Results may have fewer related files."`
  - `"Repo 'payment-gateway' filesystem read failed: configured path does not exist. Using indexed content only."`
  - `"Metrics collection disabled: observability data will not be recorded for this session."`

### `degraded_features`

- **Type**: `string[]` (optional)
- **When present**: One or more optional features are disabled server-wide
- **Content**: Machine-readable feature identifiers
- **Valid values**:
  - `"dependency_graph_expansion"` — graph-based neighbor discovery disabled
  - `"metrics_collection"` — token/latency tracking disabled
  - `"filesystem_read:<repo_name>"` — specific repo's live file reads unavailable

## Backward Compatibility

- Fields are optional and additive — existing consumers that don't check for them are unaffected
- The `content[].text` response continues to carry the full human-readable output regardless of degradation
- No existing fields are removed or have their semantics changed
